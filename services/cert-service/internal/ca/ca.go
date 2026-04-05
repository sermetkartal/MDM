package ca

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"sync"
	"time"
)

type RevokedEntry struct {
	SerialNumber *big.Int
	RevokedAt    time.Time
}

// CA provides Certificate Authority operations using crypto/x509.
type CA struct {
	cert       *x509.Certificate
	key        crypto.Signer
	mu         sync.RWMutex
	revokedCerts []RevokedEntry
	crlNumber  int64
}

// InitCA loads an existing CA from files, or generates a new self-signed root CA
// (RSA 4096-bit, 10-year validity) and saves to the given paths.
func InitCA(certPath, keyPath string) (*CA, error) {
	if certPath != "" && keyPath != "" {
		if _, err := os.Stat(certPath); err == nil {
			return loadCA(certPath, keyPath)
		}
	}

	ca, certPEM, keyPEM, err := generateRootCA("MDM")
	if err != nil {
		return nil, fmt.Errorf("generate CA: %w", err)
	}

	if certPath != "" && keyPath != "" {
		if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
			return nil, fmt.Errorf("write CA cert: %w", err)
		}
		if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
			return nil, fmt.Errorf("write CA key: %w", err)
		}
	}

	return ca, nil
}

func loadCA(certPath, keyPath string) (*CA, error) {
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return nil, fmt.Errorf("read CA cert: %w", err)
	}
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to decode CA cert PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse CA cert: %w", err)
	}

	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("read CA key: %w", err)
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, fmt.Errorf("failed to decode CA key PEM")
	}

	var key crypto.Signer
	switch keyBlock.Type {
	case "RSA PRIVATE KEY":
		key, err = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	case "EC PRIVATE KEY":
		key, err = x509.ParseECPrivateKey(keyBlock.Bytes)
	default:
		parsed, parseErr := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
		if parseErr != nil {
			return nil, fmt.Errorf("unsupported key type: %s", keyBlock.Type)
		}
		var ok bool
		key, ok = parsed.(crypto.Signer)
		if !ok {
			return nil, fmt.Errorf("parsed key is not a signer")
		}
	}
	if err != nil {
		return nil, fmt.Errorf("parse CA key: %w", err)
	}

	return &CA{cert: cert, key: key}, nil
}

func generateRootCA(org string) (*CA, []byte, []byte, error) {
	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, nil, nil, err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, nil, err
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			Organization: []string{org},
			CommonName:   org + " MDM Root CA",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return nil, nil, nil, err
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, nil, nil, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	return &CA{cert: cert, key: key}, certPEM, keyPEM, nil
}

// NewCA loads an existing CA key and certificate from PEM files (legacy compat).
func NewCA(certPath, keyPath string) (*CA, error) {
	return loadCA(certPath, keyPath)
}

// GenerateSelfSignedCA creates a new self-signed CA (legacy compat).
func GenerateSelfSignedCA(org string) (*CA, []byte, []byte, error) {
	return generateRootCA(org)
}

// SignCSR signs a Certificate Signing Request with device identity in the subject.
func (ca *CA) SignCSR(csrPEM []byte, deviceID, orgID string) ([]byte, string, error) {
	block, _ := pem.Decode(csrPEM)
	if block == nil {
		return nil, "", fmt.Errorf("failed to decode CSR PEM")
	}

	csr, err := x509.ParseCertificateRequest(block.Bytes)
	if err != nil {
		return nil, "", fmt.Errorf("parse CSR: %w", err)
	}
	if err := csr.CheckSignature(); err != nil {
		return nil, "", fmt.Errorf("invalid CSR signature: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, "", err
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   deviceID,
			Organization: []string{orgID},
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, ca.cert, csr.PublicKey, ca.key)
	if err != nil {
		return nil, "", fmt.Errorf("sign certificate: %w", err)
	}

	certPEMOut := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	return certPEMOut, serial.Text(16), nil
}

// SignCSRRaw signs a DER-encoded CSR with the given validity (legacy compat).
func (ca *CA) SignCSRRaw(csrDER []byte, validityDays int) ([]byte, string, error) {
	csr, err := x509.ParseCertificateRequest(csrDER)
	if err != nil {
		return nil, "", fmt.Errorf("parse CSR: %w", err)
	}
	if err := csr.CheckSignature(); err != nil {
		return nil, "", fmt.Errorf("invalid CSR signature: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, "", err
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      csr.Subject,
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(time.Duration(validityDays) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, ca.cert, csr.PublicKey, ca.key)
	if err != nil {
		return nil, "", fmt.Errorf("sign certificate: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	return certPEM, serial.Text(16), nil
}

// IssueCertificate creates a new key pair and certificate for a given common name.
func (ca *CA) IssueCertificate(commonName string, validityDays int) (certPEM, keyPEM []byte, serialHex string, err error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, "", err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, "", err
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName: commonName,
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().Add(time.Duration(validityDays) * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, ca.cert, &key.PublicKey, ca.key)
	if err != nil {
		return nil, nil, "", err
	}

	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	return certPEM, keyPEM, serial.Text(16), nil
}

// RevokeCertificate adds a serial number to the internal revocation list.
func (ca *CA) RevokeCertificate(serialHex string) {
	serial := new(big.Int)
	serial.SetString(serialHex, 16)

	ca.mu.Lock()
	defer ca.mu.Unlock()
	ca.revokedCerts = append(ca.revokedCerts, RevokedEntry{
		SerialNumber: serial,
		RevokedAt:    time.Now(),
	})
}

// GenerateCRL creates a Certificate Revocation List signed by the CA key.
func (ca *CA) GenerateCRL() ([]byte, error) {
	ca.mu.RLock()
	entries := make([]x509.RevocationListEntry, len(ca.revokedCerts))
	for i, rc := range ca.revokedCerts {
		entries[i] = x509.RevocationListEntry{
			SerialNumber:   rc.SerialNumber,
			RevocationTime: rc.RevokedAt,
		}
	}
	ca.mu.RUnlock()

	ca.mu.Lock()
	ca.crlNumber++
	crlNum := ca.crlNumber
	ca.mu.Unlock()

	crlDER, err := x509.CreateRevocationList(rand.Reader, &x509.RevocationList{
		RevokedCertificateEntries: entries,
		Number:                    big.NewInt(crlNum),
		ThisUpdate:                time.Now(),
		NextUpdate:                time.Now().Add(24 * time.Hour),
	}, ca.cert, ca.key)
	if err != nil {
		return nil, fmt.Errorf("create CRL: %w", err)
	}

	return pem.EncodeToMemory(&pem.Block{Type: "X509 CRL", Bytes: crlDER}), nil
}

// GenerateCRLFromSerials creates a CRL from external serial/time lists (legacy compat).
func (ca *CA) GenerateCRLFromSerials(revokedSerials []string, revokedTimes []time.Time) ([]byte, error) {
	entries := make([]x509.RevocationListEntry, len(revokedSerials))
	for i, serialHex := range revokedSerials {
		serial := new(big.Int)
		serial.SetString(serialHex, 16)
		entries[i] = x509.RevocationListEntry{
			SerialNumber:   serial,
			RevocationTime: revokedTimes[i],
		}
	}

	crlDER, err := x509.CreateRevocationList(rand.Reader, &x509.RevocationList{
		RevokedCertificateEntries: entries,
		Number:                    big.NewInt(1),
		ThisUpdate:                time.Now(),
		NextUpdate:                time.Now().Add(24 * time.Hour),
	}, ca.cert, ca.key)
	if err != nil {
		return nil, fmt.Errorf("create CRL: %w", err)
	}

	return pem.EncodeToMemory(&pem.Block{Type: "X509 CRL", Bytes: crlDER}), nil
}

// GetCACertificate returns the CA public certificate in PEM format.
func (ca *CA) GetCACertificate() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: ca.cert.Raw})
}

// GetCACertificateDER returns the CA certificate in DER format.
func (ca *CA) GetCACertificateDER() []byte {
	return ca.cert.Raw
}

// CACertPEM returns the CA certificate in PEM format (alias for GetCACertificate).
func (ca *CA) CACertPEM() []byte {
	return ca.GetCACertificate()
}

// CAKey returns the CA signing key (used by SCEP server).
func (ca *CA) CAKey() crypto.Signer {
	return ca.key
}

// CACert returns the CA x509 certificate (used by SCEP server).
func (ca *CA) CACert() *x509.Certificate {
	return ca.cert
}
