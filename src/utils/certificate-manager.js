const forge = require('node-forge');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { withImmudb, objToBuffer, bufferToObj } = require('../immudb-client');
const { Buffer } = require('buffer');

class CertificateManager {
  constructor() {
    this.pki = forge.pki;
    this.rootCA = null;
    this.rootCAKey = null;
  }

  /**
   * Initialize Certificate Authority if not exists
   */
  async initializeCA() {
    try {
      const caExists = await withImmudb(async (client) => {
        try {
          const caResponse = await client.get({
            key: Buffer.from('ca:root')
          });
          const caData = bufferToObj(caResponse.value);
          
          this.rootCA = this.pki.certificateFromPem(caData.certificate);
          this.rootCAKey = this.pki.privateKeyFromPem(caData.privateKey);
          
          return true;
        } catch (error) {
          if (error.message && error.message.includes('key not found')) {
            return false;
          }
          throw error;
        }
      });

      if (!caExists) {
        await this.generateRootCA();
      }
    } catch (error) {
      console.error('Error initializing CA:', error);
      throw error;
    }
  }

  /**
   * Generate Root Certificate Authority
   */
  async generateRootCA() {
    const keys = this.pki.rsa.generateKeyPair(2048);
    const cert = this.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [{
      name: 'countryName',
      value: 'US'
    }, {
      name: 'organizationName',
      value: 'ImmuDB Inventory CA'
    }, {
      name: 'commonName',
      value: 'ImmuDB Inventory Root CA'
    }];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true
    }]);

    cert.sign(keys.privateKey);

    this.rootCA = cert;
    this.rootCAKey = keys.privateKey;

    // Store CA in ImmuDB
    await withImmudb(async (client) => {
      const caData = {
        certificate: this.pki.certificateToPem(cert),
        privateKey: this.pki.privateKeyToPem(keys.privateKey),
        created_at: new Date().toISOString(),
        type: 'ROOT_CA'
      };

      await client.set({
        key: Buffer.from('ca:root'),
        value: objToBuffer(caData)
      });
    });

    console.log('Root CA generated and stored successfully');
  }

  /**
   * Generate certificate for user/integrator
   */
  async generateCertificate(userId, userType, commonName, validityDays = 365) {
    if (!this.rootCA || !this.rootCAKey) {
      await this.initializeCA();
    }

    const keys = this.pki.rsa.generateKeyPair(2048);
    const cert = this.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = crypto.randomBytes(16).toString('hex');
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);

    const attrs = [{
      name: 'countryName',
      value: 'US'
    }, {
      name: 'organizationName',
      value: 'ImmuDB Inventory System'
    }, {
      name: 'organizationalUnitName',
      value: userType.toUpperCase()
    }, {
      name: 'commonName',
      value: commonName
    }, {
      name: 'emailAddress',
      value: `${userId}@immudb-inventory.local`
    }];

    cert.setSubject(attrs);
    cert.setIssuer(this.rootCA.subject.attributes);
    
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: false
    }, {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true
    }, {
      name: 'extKeyUsage',
      clientAuth: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 2, // DNS
        value: `${userId}.immudb-inventory.local`
      }]
    }]);

    cert.sign(this.rootCAKey);

    const certificateData = {
      certificate_id: cert.serialNumber,
      user_id: userId,
      user_type: userType,
      common_name: commonName,
      certificate_pem: this.pki.certificateToPem(cert),
      private_key_pem: this.pki.privateKeyToPem(keys.privateKey),
      public_key_pem: this.pki.publicKeyToPem(keys.publicKey),
      serial_number: cert.serialNumber,
      issued_at: new Date().toISOString(),
      expires_at: cert.validity.notAfter.toISOString(),
      status: 'ACTIVE',
      revoked_at: null,
      revocation_reason: null
    };

    // Store certificate in ImmuDB
    await withImmudb(async (client) => {
      const certKey = `certificate:${cert.serialNumber}`;
      await client.set({
        key: Buffer.from(certKey),
        value: objToBuffer(certificateData)
      });

      // Also store by user_id for easy lookup
      const userCertKey = `user_certificate:${userId}`;
      await client.set({
        key: Buffer.from(userCertKey),
        value: objToBuffer({
          certificate_id: cert.serialNumber,
          user_id: userId,
          created_at: new Date().toISOString()
        })
      });
    });

    return {
      certificate_id: cert.serialNumber,
      certificate_pem: certificateData.certificate_pem,
      private_key_pem: certificateData.private_key_pem,
      expires_at: certificateData.expires_at
    };
  }

  /**
   * Validate certificate
   */
  async validateCertificate(certificatePem) {
    try {
      const cert = this.pki.certificateFromPem(certificatePem);
      
      // Check if certificate is not expired
      const now = new Date();
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        return { valid: false, reason: 'Certificate expired or not yet valid' };
      }

      // Check if certificate is revoked
      const certificateData = await withImmudb(async (client) => {
        try {
          const certResponse = await client.get({
            key: Buffer.from(`certificate:${cert.serialNumber}`)
          });
          return bufferToObj(certResponse.value);
        } catch (error) {
          if (error.message && error.message.includes('key not found')) {
            return null;
          }
          throw error;
        }
      });

      if (!certificateData) {
        return { valid: false, reason: 'Certificate not found in system' };
      }

      if (certificateData.status === 'REVOKED') {
        return { 
          valid: false, 
          reason: `Certificate revoked: ${certificateData.revocation_reason}` 
        };
      }

      // Verify certificate signature
      if (!this.rootCA || !this.rootCAKey) {
        await this.initializeCA();
      }

      try {
        const verified = this.rootCA.verify(cert);
        if (!verified) {
          return { valid: false, reason: 'Certificate signature invalid' };
        }
      } catch (error) {
        return { valid: false, reason: 'Certificate verification failed' };
      }

      return { 
        valid: true, 
        certificate_data: certificateData,
        expires_at: cert.validity.notAfter.toISOString()
      };
    } catch (error) {
      return { valid: false, reason: `Certificate parsing error: ${error.message}` };
    }
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(certificateId, reason = 'unspecified') {
    return await withImmudb(async (client) => {
      try {
        const certResponse = await client.get({
          key: Buffer.from(`certificate:${certificateId}`)
        });
        
        const certificateData = bufferToObj(certResponse.value);
        
        if (certificateData.status === 'REVOKED') {
          throw new Error('Certificate already revoked');
        }

        // Update certificate status
        certificateData.status = 'REVOKED';
        certificateData.revoked_at = new Date().toISOString();
        certificateData.revocation_reason = reason;

        await client.set({
          key: Buffer.from(`certificate:${certificateId}`),
          value: objToBuffer(certificateData)
        });

        return {
          certificate_id: certificateId,
          revoked_at: certificateData.revoked_at,
          reason: reason
        };
      } catch (error) {
        if (error.message && error.message.includes('key not found')) {
          throw new Error('Certificate not found');
        }
        throw error;
      }
    });
  }

  /**
   * List all certificates with optional filtering
   */
  async listCertificates(filters = {}) {
    return await withImmudb(async (client) => {
      const certificates = [];
      
      try {
        const scanResponse = await client.scan({
          seekKey: Buffer.from('certificate:'),
          limit: 1000,
          desc: false
        });

        for (const item of scanResponse.entriesList) {
          const key = item.key.toString();
          if (key.startsWith('certificate:') && !key.includes('user_certificate:')) {
            try {
              const certData = bufferToObj(Buffer.from(item.value));
              
              // Apply filters
              if (filters.user_type && certData.user_type !== filters.user_type) continue;
              if (filters.status && certData.status !== filters.status) continue;
              if (filters.user_id && certData.user_id !== filters.user_id) continue;
              
              certificates.push({
                certificate_id: certData.certificate_id,
                user_id: certData.user_id,
                user_type: certData.user_type,
                common_name: certData.common_name,
                serial_number: certData.serial_number,
                issued_at: certData.issued_at,
                expires_at: certData.expires_at,
                status: certData.status,
                revoked_at: certData.revoked_at,
                revocation_reason: certData.revocation_reason
              });
            } catch (parseError) {
              continue; // Skip invalid entries
            }
          }
        }
        
        return certificates.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
      } catch (scanError) {
        console.error('Error scanning certificates:', scanError);
        return [];
      }
    });
  }

  /**
   * Get certificate by ID
   */
  async getCertificate(certificateId) {
    return await withImmudb(async (client) => {
      try {
        const certResponse = await client.get({
          key: Buffer.from(`certificate:${certificateId}`)
        });
        
        return bufferToObj(certResponse.value);
      } catch (error) {
        if (error.message && error.message.includes('key not found')) {
          return null;
        }
        throw error;
      }
    });
  }

  /**
   * Generate QR code for certificate verification
   */
  async generateQRCode(certificateId, baseUrl = 'http://localhost:3000') {
    try {
      // Create verification URL
      const verificationUrl = `${baseUrl}/public/?cert=${encodeURIComponent(certificateId)}`;
      
      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });
      
      return {
        qr_code_data_url: qrCodeDataUrl,
        verification_url: verificationUrl,
        certificate_id: certificateId
      };
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate QR code as SVG
   */
  async generateQRCodeSVG(certificateId, baseUrl = 'http://localhost:3000') {
    try {
      // Create verification URL
      const verificationUrl = `${baseUrl}/public/?cert=${encodeURIComponent(certificateId)}`;
      
      // Generate QR code as SVG
      const qrCodeSVG = await QRCode.toString(verificationUrl, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });
      
      return {
        qr_code_svg: qrCodeSVG,
        verification_url: verificationUrl,
        certificate_id: certificateId
      };
    } catch (error) {
      throw new Error(`Failed to generate QR code SVG: ${error.message}`);
    }
  }

  /**
   * Get certificate with QR code
   */
  async getCertificateWithQR(certificateId, baseUrl = 'http://localhost:3000') {
    const certificate = await this.getCertificate(certificateId);
    
    if (!certificate) {
      return null;
    }
    
    const qrCode = await this.generateQRCode(certificateId, baseUrl);
    
    return {
      ...certificate,
      qr_code: qrCode
    };
  }
}

module.exports = new CertificateManager();