const express = require('express');
const router = express.Router();
const CertificateManager = require('../utils/certificate-manager');
const { AuditLogger, AUDIT_EVENTS } = require('../utils/audit-logger');
const path = require('path');

/**
 * PUBLIC CERTIFICATE VERIFICATION ROUTES
 * These routes don't require authentication to allow public verification
 */

// GET /public/certificates/verify/:certificateId - Verify certificate by ID
router.get('/certificates/verify/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;
    
    if (!certificateId) {
      return res.status(400).json({
        message: 'Certificate ID is required'
      });
    }

    // Get certificate details
    const certificate = await CertificateManager.getCertificate(certificateId);
    
    if (!certificate) {
      return res.status(404).json({
        valid: false,
        message: 'Certificate not found',
        certificate_id: certificateId
      });
    }

    // Validate certificate
    const validation = await CertificateManager.validateCertificate(certificate.certificate_pem);
    
    // Log the verification attempt
    await AuditLogger.logEvent(AUDIT_EVENTS.CERTIFICATE_VERIFIED, {
      user_id: 'public',
      username: 'public_verification',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'certificate',
      resource_id: certificateId,
      action: 'verify',
      success: validation.valid,
      additional_data: {
        certificate_id: certificateId,
        validation_result: validation.valid ? 'valid' : validation.reason
      }
    });

    // Return verification result with safe certificate info
    const response = {
      valid: validation.valid,
      certificate_id: certificateId,
      verification_timestamp: new Date().toISOString(),
      ...(validation.valid ? {
        certificate_info: {
          certificate_id: certificate.certificate_id,
          user_id: certificate.user_id,
          user_type: certificate.user_type,
          common_name: certificate.common_name,
          serial_number: certificate.serial_number,
          issued_at: certificate.issued_at,
          expires_at: certificate.expires_at,
          status: certificate.status
        }
      } : {
        reason: validation.reason
      })
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Certificate verification error:', error);
    
    // Log the error
    await AuditLogger.logEvent(AUDIT_EVENTS.CERTIFICATE_VERIFIED, {
      user_id: 'public',
      username: 'public_verification',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'certificate',
      resource_id: req.params.certificateId,
      action: 'verify',
      success: false,
      additional_data: {
        error: error.message
      }
    });

    res.status(500).json({
      valid: false,
      message: 'Certificate verification failed',
      certificate_id: req.params.certificateId,
      error: 'Internal server error'
    });
  }
});

// GET /public/certificates/lookup/:serialNumber - Look up certificate by serial number
router.get('/certificates/lookup/:serialNumber', async (req, res) => {
  try {
    const { serialNumber } = req.params;
    
    if (!serialNumber) {
      return res.status(400).json({
        message: 'Serial number is required'
      });
    }

    // Find certificate by serial number
    const certificates = await CertificateManager.listCertificates();
    const certificate = certificates.find(cert => 
      cert.serial_number === serialNumber || 
      cert.certificate_id === serialNumber
    );

    if (!certificate) {
      return res.status(404).json({
        found: false,
        message: 'Certificate not found',
        serial_number: serialNumber
      });
    }

    // Get full certificate details for validation
    const fullCertificate = await CertificateManager.getCertificate(certificate.certificate_id);
    const validation = await CertificateManager.validateCertificate(fullCertificate.certificate_pem);

    // Log the lookup attempt
    await AuditLogger.logEvent(AUDIT_EVENTS.CERTIFICATE_LOOKUP, {
      user_id: 'public',
      username: 'public_lookup',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'certificate',
      resource_id: certificate.certificate_id,
      action: 'lookup',
      success: true,
      additional_data: {
        serial_number: serialNumber,
        certificate_id: certificate.certificate_id
      }
    });

    const response = {
      found: true,
      certificate_info: {
        certificate_id: certificate.certificate_id,
        user_id: certificate.user_id,
        user_type: certificate.user_type,
        common_name: certificate.common_name,
        serial_number: certificate.serial_number,
        issued_at: certificate.issued_at,
        expires_at: certificate.expires_at,
        status: certificate.status
      },
      validation: {
        valid: validation.valid,
        reason: validation.valid ? 'Certificate is valid' : validation.reason,
        verified_at: new Date().toISOString()
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Certificate lookup error:', error);
    
    // Log the error
    await AuditLogger.logEvent(AUDIT_EVENTS.CERTIFICATE_LOOKUP, {
      user_id: 'public',
      username: 'public_lookup',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'certificate',
      resource_id: req.params.serialNumber,
      action: 'lookup',
      success: false,
      additional_data: {
        error: error.message
      }
    });

    res.status(500).json({
      found: false,
      message: 'Certificate lookup failed',
      serial_number: req.params.serialNumber,
      error: 'Internal server error'
    });
  }
});

// GET /public/certificates/check/:certificateId - Quick certificate status check
router.get('/certificates/check/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;
    
    const certificate = await CertificateManager.getCertificate(certificateId);
    
    if (!certificate) {
      return res.status(404).json({
        exists: false,
        certificate_id: certificateId
      });
    }

    // Log the status check
    await AuditLogger.logEvent(AUDIT_EVENTS.CERTIFICATE_STATUS_CHECK, {
      user_id: 'public',
      username: 'public_check',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'certificate',
      resource_id: certificateId,
      action: 'status_check',
      success: true
    });

    const now = new Date();
    const expiresAt = new Date(certificate.expires_at);
    const isExpired = now > expiresAt;
    const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    const response = {
      exists: true,
      certificate_id: certificateId,
      status: certificate.status,
      expired: isExpired,
      expires_at: certificate.expires_at,
      days_until_expiry: isExpired ? 0 : daysUntilExpiry,
      issued_at: certificate.issued_at,
      user_type: certificate.user_type,
      common_name: certificate.common_name,
      revoked: certificate.status === 'REVOKED',
      ...(certificate.status === 'REVOKED' && {
        revoked_at: certificate.revoked_at,
        revocation_reason: certificate.revocation_reason
      })
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Certificate status check error:', error);
    res.status(500).json({
      exists: false,
      certificate_id: req.params.certificateId,
      error: 'Internal server error'
    });
  }
});

module.exports = router;