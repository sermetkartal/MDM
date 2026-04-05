package profile

import (
	"crypto"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"go.mozilla.org/pkcs7"
)

type Signer struct {
	cert       *x509.Certificate
	privateKey crypto.PrivateKey
}

func NewSigner(certPath, keyPath string) (*Signer, error) {
	if certPath == "" || keyPath == "" {
		return &Signer{}, nil
	}

	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return nil, fmt.Errorf("read signing cert: %w", err)
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block from certificate")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse certificate: %w", err)
	}

	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("read signing key: %w", err)
	}

	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, fmt.Errorf("failed to decode PEM block from key")
	}

	privateKey, err := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	if err != nil {
		// Try PKCS1 as fallback
		privateKey, err = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
	}

	return &Signer{
		cert:       cert,
		privateKey: privateKey,
	}, nil
}

// Sign signs profile data using PKCS#7 (CMS) detached signature.
func (s *Signer) Sign(profileData []byte) ([]byte, error) {
	if s.cert == nil || s.privateKey == nil {
		return profileData, nil
	}

	signedData, err := pkcs7.NewSignedData(profileData)
	if err != nil {
		return nil, fmt.Errorf("create signed data: %w", err)
	}

	if err := signedData.AddSigner(s.cert, s.privateKey, pkcs7.SignerInfoConfig{}); err != nil {
		return nil, fmt.Errorf("add signer: %w", err)
	}

	signed, err := signedData.Finish()
	if err != nil {
		return nil, fmt.Errorf("finish signing: %w", err)
	}

	return signed, nil
}
