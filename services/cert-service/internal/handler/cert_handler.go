package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/sermetkartal/mdm/services/cert-service/internal/ca"
	"github.com/sermetkartal/mdm/services/cert-service/internal/model"
	"github.com/sermetkartal/mdm/services/cert-service/internal/repository"
	"google.golang.org/grpc"
)

type CertHandler struct {
	repo *repository.CertRepository
	ca   *ca.CA
	nc   *nats.Conn
}

func NewCertHandler(repo *repository.CertRepository, certCA *ca.CA, nc *nats.Conn) *CertHandler {
	return &CertHandler{repo: repo, ca: certCA, nc: nc}
}

func (h *CertHandler) RegisterGRPC(server *grpc.Server) {
	slog.Info("cert handler registered")
}

// HandleEnrollmentCSR processes a CSR from a device during enrollment, issues a cert,
// and stores metadata in the certificates table.
func (h *CertHandler) HandleEnrollmentCSR(ctx context.Context, deviceID, orgID string, csrPEM []byte) ([]byte, *model.Certificate, error) {
	certPEM, serialHex, err := h.ca.SignCSR(csrPEM, deviceID, orgID)
	if err != nil {
		return nil, nil, err
	}

	thumbprint := sha256Hex(certPEM)
	now := time.Now()
	notAfter := now.Add(365 * 24 * time.Hour)

	orgUUID, _ := uuid.Parse(orgID)
	cert := &model.Certificate{
		OrgID:        orgUUID,
		DeviceID:     deviceID,
		Name:         "Device Certificate - " + deviceID,
		Type:         "device",
		Thumbprint:   thumbprint,
		SerialNumber: serialHex,
		Issuer:       "MDM Root CA",
		Subject:      deviceID,
		NotBefore:    &now,
		NotAfter:     &notAfter,
		Status:       "active",
	}

	if err := h.repo.Create(ctx, cert); err != nil {
		return nil, nil, err
	}

	h.publishEvent("mdm.cert.issued", map[string]interface{}{
		"cert_id":   cert.ID,
		"org_id":    orgID,
		"device_id": deviceID,
		"subject":   deviceID,
		"action":    "cert.issued",
		"resource_type": "certificate",
		"resource_id":   cert.ID.String(),
		"actor":     "system",
		"actor_type": "system",
	})

	return certPEM, cert, nil
}

// HandleRenewal revokes the old certificate for a device and issues a new one.
func (h *CertHandler) HandleRenewal(ctx context.Context, deviceID string, csrPEM []byte) ([]byte, *model.Certificate, error) {
	certs, err := h.repo.GetActiveByDeviceID(ctx, deviceID)
	if err != nil {
		return nil, nil, err
	}

	for _, old := range certs {
		h.ca.RevokeCertificate(old.SerialNumber)
		if err := h.repo.UpdateStatus(ctx, old.ID, "revoked"); err != nil {
			slog.Error("failed to revoke old cert during renewal", "cert_id", old.ID, "error", err)
		}
	}

	orgID := ""
	if len(certs) > 0 {
		orgID = certs[0].OrgID.String()
	}

	certPEM, cert, err := h.HandleEnrollmentCSR(ctx, deviceID, orgID, csrPEM)
	if err != nil {
		return nil, nil, err
	}

	h.publishEvent("mdm.cert.renewed", map[string]interface{}{
		"cert_id":   cert.ID,
		"device_id": deviceID,
		"action":    "cert.renewed",
		"resource_type": "certificate",
		"resource_id":   cert.ID.String(),
		"actor":     "system",
		"actor_type": "system",
	})

	return certPEM, cert, nil
}

// HandleRevocation revokes all active certificates for a device and updates CRL.
func (h *CertHandler) HandleRevocation(ctx context.Context, deviceID string) error {
	certs, err := h.repo.GetActiveByDeviceID(ctx, deviceID)
	if err != nil {
		return err
	}

	for _, cert := range certs {
		h.ca.RevokeCertificate(cert.SerialNumber)
		if err := h.repo.UpdateStatus(ctx, cert.ID, "revoked"); err != nil {
			slog.Error("failed to revoke cert", "cert_id", cert.ID, "error", err)
		}

		h.publishEvent("mdm.cert.revoked", map[string]interface{}{
			"cert_id":   cert.ID,
			"device_id": deviceID,
			"action":    "cert.revoked",
			"resource_type": "certificate",
			"resource_id":   cert.ID.String(),
			"actor":     "system",
			"actor_type": "system",
		})
	}

	return nil
}

// HandleSCEP processes SCEP protocol requests (delegated from the SCEP HTTP server).
func (h *CertHandler) HandleSCEP(ctx context.Context, operation string, message []byte) ([]byte, error) {
	switch operation {
	case "GetCACert":
		return h.ca.GetCACertificateDER(), nil
	case "GetCACaps":
		return []byte("POSTPKIOperation\nSHA-256\nAES\nSCEPStandard\nRenewal"), nil
	default:
		return nil, nil
	}
}

// SignCSR signs a CSR with the given validity days (legacy interface).
func (h *CertHandler) SignCSR(ctx context.Context, req *model.CertRequest) ([]byte, *model.Certificate, error) {
	validityDays := req.ValidityDays
	if validityDays <= 0 {
		validityDays = 365
	}

	certPEM, serialHex, err := h.ca.SignCSRRaw(req.CSR, validityDays)
	if err != nil {
		return nil, nil, err
	}

	thumbprint := sha256Hex(certPEM)
	now := time.Now()
	notAfter := now.Add(time.Duration(validityDays) * 24 * time.Hour)

	cert := &model.Certificate{
		OrgID:        req.OrgID,
		Name:         req.CommonName,
		Type:         "client",
		Thumbprint:   thumbprint,
		SerialNumber: serialHex,
		Issuer:       "MDM Root CA",
		Subject:      req.CommonName,
		NotBefore:    &now,
		NotAfter:     &notAfter,
		Status:       "active",
	}

	if err := h.repo.Create(ctx, cert); err != nil {
		return nil, nil, err
	}

	h.publishEvent("mdm.cert.issued", map[string]interface{}{
		"cert_id": cert.ID,
		"org_id":  req.OrgID,
		"subject": req.CommonName,
		"action":  "cert.issued",
		"resource_type": "certificate",
		"resource_id":   cert.ID.String(),
	})

	return certPEM, cert, nil
}

// IssueCertificate creates a new key pair and certificate for a given common name.
func (h *CertHandler) IssueCertificate(ctx context.Context, req *model.CertRequest) (certPEM, keyPEM []byte, cert *model.Certificate, err error) {
	validityDays := req.ValidityDays
	if validityDays <= 0 {
		validityDays = 365
	}

	certPEM, keyPEM, serialHex, err := h.ca.IssueCertificate(req.CommonName, validityDays)
	if err != nil {
		return nil, nil, nil, err
	}

	thumbprint := sha256Hex(certPEM)
	now := time.Now()
	notAfter := now.Add(time.Duration(validityDays) * 24 * time.Hour)

	cert = &model.Certificate{
		OrgID:        req.OrgID,
		Name:         req.CommonName,
		Type:         "client",
		Thumbprint:   thumbprint,
		SerialNumber: serialHex,
		Issuer:       "MDM Root CA",
		Subject:      req.CommonName,
		NotBefore:    &now,
		NotAfter:     &notAfter,
		Status:       "active",
	}

	if err := h.repo.Create(ctx, cert); err != nil {
		return nil, nil, nil, err
	}

	return certPEM, keyPEM, cert, nil
}

// RevokeCertificate revokes a single certificate by ID.
func (h *CertHandler) RevokeCertificate(ctx context.Context, id uuid.UUID) error {
	cert, err := h.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	h.ca.RevokeCertificate(cert.SerialNumber)
	if err := h.repo.UpdateStatus(ctx, id, "revoked"); err != nil {
		return err
	}

	h.publishEvent("mdm.cert.revoked", map[string]interface{}{
		"cert_id": id,
		"action":  "cert.revoked",
		"resource_type": "certificate",
		"resource_id":   id.String(),
	})
	return nil
}

// GetCRL returns the current CRL from the CA.
func (h *CertHandler) GetCRL(ctx context.Context) ([]byte, error) {
	return h.ca.GenerateCRL()
}

// GetCACertPEM returns the CA certificate in PEM format.
func (h *CertHandler) GetCACertPEM() []byte {
	return h.ca.GetCACertificate()
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func (h *CertHandler) publishEvent(subject string, data interface{}) {
	if h.nc == nil {
		return
	}
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal event", "subject", subject, "error", err)
		return
	}
	if err := h.nc.Publish(subject, payload); err != nil {
		slog.Error("failed to publish event", "subject", subject, "error", err)
	}
}
