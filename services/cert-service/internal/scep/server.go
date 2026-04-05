package scep

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/sermetkartal/mdm/services/cert-service/internal/ca"
)

// Server handles SCEP protocol requests over HTTP.
type Server struct {
	ca              *ca.CA
	challengePassword string
}

// NewServer creates a new SCEP server with the given CA and challenge password.
func NewServer(certCA *ca.CA, challengePassword string) *Server {
	return &Server{
		ca:              certCA,
		challengePassword: challengePassword,
	}
}

// Handler returns an http.Handler for SCEP protocol endpoints.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/scep", s.handleSCEP)
	return mux
}

func (s *Server) handleSCEP(w http.ResponseWriter, r *http.Request) {
	operation := r.URL.Query().Get("operation")

	switch operation {
	case "GetCACert":
		s.handleGetCACert(w, r)
	case "GetCACaps":
		s.handleGetCACaps(w, r)
	case "PKIOperation":
		s.handlePKIOperation(w, r)
	default:
		http.Error(w, "unsupported operation", http.StatusBadRequest)
	}
}

// handleGetCACert returns the CA certificate in DER format.
func (s *Server) handleGetCACert(w http.ResponseWriter, _ *http.Request) {
	derBytes := s.ca.GetCACertificateDER()
	w.Header().Set("Content-Type", "application/x-x509-ca-cert")
	w.WriteHeader(http.StatusOK)
	w.Write(derBytes)
}

// handleGetCACaps returns the SCEP server capabilities.
func (s *Server) handleGetCACaps(w http.ResponseWriter, _ *http.Request) {
	caps := "POSTPKIOperation\nSHA-256\nAES\nSCEPStandard\nRenewal"
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(caps))
}

// handlePKIOperation processes SCEP PKIOperation requests.
// This is a simplified implementation that handles direct PEM/DER CSR submission.
// A production implementation would process full PKCS#7 enveloped data.
func (s *Server) handlePKIOperation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required for PKIOperation", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024))
	if err != nil {
		slog.Error("failed to read SCEP request body", "error", err)
		http.Error(w, "failed to read request", http.StatusBadRequest)
		return
	}

	// Try to parse as PEM-encoded CSR first
	csrDER := body
	if block, _ := pem.Decode(body); block != nil {
		csrDER = block.Bytes
	}

	csr, err := x509.ParseCertificateRequest(csrDER)
	if err != nil {
		slog.Error("failed to parse CSR in PKIOperation", "error", err)
		http.Error(w, "invalid CSR", http.StatusBadRequest)
		return
	}

	if err := csr.CheckSignature(); err != nil {
		http.Error(w, "invalid CSR signature", http.StatusBadRequest)
		return
	}

	// Extract device identity from CSR subject
	deviceID := csr.Subject.CommonName
	orgID := ""
	if len(csr.Subject.Organization) > 0 {
		orgID = csr.Subject.Organization[0]
	}

	csrPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: csrDER})

	certPEM, serialHex, err := s.ca.SignCSR(csrPEM, deviceID, orgID)
	if err != nil {
		slog.Error("failed to sign CSR via SCEP", "error", err)
		http.Error(w, fmt.Sprintf("failed to sign CSR: %v", err), http.StatusInternalServerError)
		return
	}

	slog.Info("SCEP certificate issued", "device_id", deviceID, "serial", serialHex)

	// Return signed certificate in DER format
	block, _ := pem.Decode(certPEM)
	if block == nil {
		http.Error(w, "internal error encoding certificate", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-pki-message")
	w.WriteHeader(http.StatusOK)
	w.Write(block.Bytes)
}

// GetChallengePassword returns the SCEP challenge password for enrollment.
func (s *Server) GetChallengePassword() string {
	return s.challengePassword
}
