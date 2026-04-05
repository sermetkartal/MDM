package mdm

import (
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/apns"
	"github.com/sermetkartal/mdm/services/ios-mdm-service/internal/model"
)

// Plist structures for MDM protocol messages

type CheckinMessage struct {
	MessageType  string `plist:"MessageType" xml:"dict>string"`
	Topic        string `plist:"Topic"`
	UDID         string `plist:"UDID"`
	DeviceName   string `plist:"DeviceName"`
	Model        string `plist:"Model"`
	ModelName    string `plist:"ModelName"`
	ProductName  string `plist:"ProductName"`
	SerialNumber string `plist:"SerialNumber"`
	IMEI         string `plist:"IMEI"`
	MEID         string `plist:"MEID"`
	OSVersion    string `plist:"OSVersion"`
	BuildVersion string `plist:"BuildVersion"`
	PushMagic    string `plist:"PushMagic"`
	Token        []byte `plist:"Token"`
	UnlockToken  []byte `plist:"UnlockToken"`
}

type CommandPollResponse struct {
	CommandUUID string `plist:"CommandUUID"`
	Command     CommandPayload
}

type CommandPayload struct {
	RequestType string `plist:"RequestType"`
}

type DeviceReport struct {
	UDID        string `plist:"UDID"`
	Status      string `plist:"Status"`
	CommandUUID string `plist:"CommandUUID"`
}

// PlistDict represents a simplified plist dictionary for XML encoding.
type PlistDict struct {
	XMLName xml.Name    `xml:"plist"`
	Version string      `xml:"version,attr"`
	Dict    PlistKVList `xml:"dict"`
}

type PlistKVList struct {
	Items []PlistKV
}

type PlistKV struct {
	Key   string
	Value string
}

func (d PlistKVList) MarshalXML(e *xml.Encoder, start xml.StartElement) error {
	for _, item := range d.Items {
		if err := e.EncodeElement(item.Key, xml.StartElement{Name: xml.Name{Local: "key"}}); err != nil {
			return err
		}
		if err := e.EncodeElement(item.Value, xml.StartElement{Name: xml.Name{Local: "string"}}); err != nil {
			return err
		}
	}
	return nil
}

type Server struct {
	queue      *Queue
	apnsClient *apns.Client
	devices    map[string]*model.IOSDevice // keyed by UDID; in production, use DB
}

func NewServer(queue *Queue, apnsClient *apns.Client) *Server {
	return &Server{
		queue:      queue,
		apnsClient: apnsClient,
		devices:    make(map[string]*model.IOSDevice),
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("PUT /mdm/checkin", s.HandleCheckin)
	mux.HandleFunc("PUT /mdm/command", s.HandleCommand)
	mux.HandleFunc("GET /health", s.HandleHealth)
}

func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"ok","service":"ios-mdm-service"}`)
}

func (s *Server) HandleCheckin(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("failed to read checkin body", "error", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	msg, err := parseCheckinMessage(body)
	if err != nil {
		slog.Error("failed to parse checkin message", "error", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	slog.Info("checkin received", "type", msg.MessageType, "udid", msg.UDID)

	switch msg.MessageType {
	case "Authenticate":
		s.handleAuthenticate(w, msg)
	case "TokenUpdate":
		s.handleTokenUpdate(w, msg)
	case "CheckOut":
		s.handleCheckOut(w, msg)
	default:
		slog.Warn("unknown checkin message type", "type", msg.MessageType)
		http.Error(w, "unknown message type", http.StatusBadRequest)
	}
}

func (s *Server) handleAuthenticate(w http.ResponseWriter, msg *CheckinMessage) {
	now := time.Now()
	device := &model.IOSDevice{
		ID:                uuid.New(),
		UDID:              msg.UDID,
		SerialNumber:      msg.SerialNumber,
		DeviceName:        msg.DeviceName,
		Model:             msg.Model,
		ModelName:         msg.ModelName,
		ProductName:       msg.ProductName,
		OSVersion:         msg.OSVersion,
		BuildVersion:      msg.BuildVersion,
		IMEI:              msg.IMEI,
		MEID:              msg.MEID,
		Topic:             msg.Topic,
		SupervisionStatus: model.SupervisionStatusUnsupervised,
		EnrollmentType:    model.EnrollmentTypeManual,
		EnrolledAt:        &now,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	s.devices[msg.UDID] = device

	slog.Info("device authenticated", "udid", msg.UDID, "serial", msg.SerialNumber, "model", msg.ModelName)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleTokenUpdate(w http.ResponseWriter, msg *CheckinMessage) {
	device, ok := s.devices[msg.UDID]
	if !ok {
		slog.Warn("token update for unknown device", "udid", msg.UDID)
		http.Error(w, "device not found", http.StatusNotFound)
		return
	}

	device.PushToken = fmt.Sprintf("%x", msg.Token)
	device.PushMagic = msg.PushMagic
	if len(msg.UnlockToken) > 0 {
		device.UnlockToken = msg.UnlockToken
	}
	now := time.Now()
	device.LastSeenAt = &now
	device.UpdatedAt = now

	slog.Info("token updated", "udid", msg.UDID, "push_magic", msg.PushMagic)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleCheckOut(w http.ResponseWriter, msg *CheckinMessage) {
	delete(s.devices, msg.UDID)
	slog.Info("device checked out", "udid", msg.UDID)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleCommand(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("failed to read command response body", "error", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	report, err := parseDeviceReport(body)
	if err != nil {
		slog.Error("failed to parse device report", "error", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Update last seen
	if device, ok := s.devices[report.UDID]; ok {
		now := time.Now()
		device.LastSeenAt = &now
	}

	// Process the status of the previous command if present
	if report.CommandUUID != "" {
		slog.Info("command response", "udid", report.UDID, "command_uuid", report.CommandUUID, "status", report.Status)
	}

	// Deliver the next queued command
	cmd, err := s.queue.Dequeue(r.Context(), report.UDID)
	if err != nil || cmd == nil {
		// No pending commands — return empty 200
		w.WriteHeader(http.StatusOK)
		return
	}

	slog.Info("delivering command", "udid", report.UDID, "command_uuid", cmd.CommandUUID, "request_type", cmd.RequestType)

	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusOK)
	w.Write(cmd.Command)
}

func (s *Server) GetDevice(udid string) *model.IOSDevice {
	return s.devices[udid]
}

// parseCheckinMessage parses a plist-encoded check-in message.
// For simplicity, this uses basic XML parsing of plist format.
func parseCheckinMessage(data []byte) (*CheckinMessage, error) {
	msg := &CheckinMessage{}
	dict, err := parsePlistDict(data)
	if err != nil {
		return nil, err
	}

	for k, v := range dict {
		switch k {
		case "MessageType":
			msg.MessageType = v
		case "Topic":
			msg.Topic = v
		case "UDID":
			msg.UDID = v
		case "DeviceName":
			msg.DeviceName = v
		case "Model":
			msg.Model = v
		case "ModelName":
			msg.ModelName = v
		case "ProductName":
			msg.ProductName = v
		case "SerialNumber":
			msg.SerialNumber = v
		case "IMEI":
			msg.IMEI = v
		case "MEID":
			msg.MEID = v
		case "OSVersion":
			msg.OSVersion = v
		case "BuildVersion":
			msg.BuildVersion = v
		case "PushMagic":
			msg.PushMagic = v
		}
	}

	return msg, nil
}

func parseDeviceReport(data []byte) (*DeviceReport, error) {
	report := &DeviceReport{}
	dict, err := parsePlistDict(data)
	if err != nil {
		return nil, err
	}

	for k, v := range dict {
		switch k {
		case "UDID":
			report.UDID = v
		case "Status":
			report.Status = v
		case "CommandUUID":
			report.CommandUUID = v
		}
	}

	return report, nil
}

// parsePlistDict does minimal XML plist parsing extracting string key-value pairs.
func parsePlistDict(data []byte) (map[string]string, error) {
	type plistXML struct {
		XMLName xml.Name `xml:"plist"`
		Dict    struct {
			Elements []string `xml:",any"`
		} `xml:"dict"`
	}

	// Manual parse: iterate through <key>...</key><string>...</string> pairs
	result := make(map[string]string)
	decoder := xml.NewDecoder(nil)
	_ = decoder

	// Simple state-machine parser for plist key-string pairs
	d := xml.NewDecoder(xmlReader(data))
	var currentKey string
	inDict := false

	for {
		token, err := d.Token()
		if err != nil {
			break
		}

		switch t := token.(type) {
		case xml.StartElement:
			if t.Name.Local == "dict" {
				inDict = true
			}
			if inDict && t.Name.Local == "key" {
				var key string
				if err := d.DecodeElement(&key, &t); err == nil {
					currentKey = key
				}
			}
			if inDict && t.Name.Local == "string" && currentKey != "" {
				var val string
				if err := d.DecodeElement(&val, &t); err == nil {
					result[currentKey] = val
					currentKey = ""
				}
			}
		}
	}

	return result, nil
}

type byteReader struct {
	data []byte
	pos  int
}

func xmlReader(data []byte) io.Reader {
	return &byteReader{data: data}
}

func (r *byteReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
