const express = require('express');
const router = express.Router();
const { UserManager, USER_ROLES } = require('../utils/user-manager');
const CertificateManager = require('../utils/certificate-manager');
const { AuditLogger, AUDIT_EVENTS } = require('../utils/audit-logger');
const { authenticateJWT, requireAdmin, requireSuperAdmin, requirePermission, rateLimits } = require('../middleware/auth');

// Apply rate limiting to all admin routes
router.use(rateLimits.strict);

// All admin routes require JWT authentication
router.use(authenticateJWT);

/**
 * AUTHENTICATION ROUTES
 */

// POST /api/admin/auth/login - Admin login
router.post('/auth/login', rateLimits.auth, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required'
      });
    }

    try {
      const authResult = await UserManager.authenticateUser(username, password);
      
      // Log successful login
      await AuditLogger.logLogin(
        username,
        authResult.user.user_id,
        req.ip,
        req.headers['user-agent'],
        true
      );
      
      res.status(200).json({
        message: 'Login successful',
        ...authResult
      });
    } catch (error) {
      // Log failed login
      await AuditLogger.logLogin(
        username,
        null,
        req.ip,
        req.headers['user-agent'],
        false,
        error.message
      );
      
      res.status(401).json({
        message: error.message
      });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      message: 'Login failed',
      error: error.message
    });
  }
});

// POST /api/admin/auth/change-password - Change password
router.post('/auth/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({
        message: 'Current password and new password are required'
      });
    }

    const result = await UserManager.changePassword(
      req.user.user_id,
      current_password,
      new_password
    );
    
    // Log password change
    await AuditLogger.logEvent(AUDIT_EVENTS.PASSWORD_CHANGED, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      resource: 'password',
      action: 'change'
    });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Password change error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

/**
 * USER MANAGEMENT ROUTES
 */

// GET /api/admin/users - List all users
router.get('/users', requirePermission('users.read'), async (req, res) => {
  try {
    const { role, status } = req.query;
    const filters = {};
    
    if (role) filters.role = role;
    if (status) filters.status = status;
    
    const users = await UserManager.listUsers(filters);
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'users',
      action: 'list'
    });
    
    res.status(200).json({
      users,
      total: users.length,
      filters_applied: filters
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      message: 'Failed to retrieve users',
      error: error.message
    });
  }
});

// GET /api/admin/users/:userId - Get specific user
router.get('/users/:userId', requirePermission('users.read'), async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserManager.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'users',
      action: 'read',
      resource_id: userId
    });
    
    res.status(200).json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      message: 'Failed to retrieve user',
      error: error.message
    });
  }
});

// POST /api/admin/users - Create new user
router.post('/users', requirePermission('users.create'), async (req, res) => {
  try {
    const userData = {
      ...req.body,
      created_by: req.user.user_id
    };
    
    const newUser = await UserManager.createUser(userData);
    
    await AuditLogger.logUserOperation(
      AUDIT_EVENTS.USER_CREATED,
      req.user.user_id,
      req.user.username,
      newUser.user_id,
      null,
      newUser,
      req.ip
    );
    
    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

// PUT /api/admin/users/:userId - Update user
router.put('/users/:userId', requirePermission('users.update'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get old user data for audit
    const oldUser = await UserManager.getUserById(userId);
    if (!oldUser) {
      return res.status(404).json({
        message: 'User not found'
      });
    }
    
    const updatedUser = await UserManager.updateUser(
      userId,
      req.body,
      req.user.user_id
    );
    
    // Log role change separately if it occurred
    if (req.body.role && req.body.role !== oldUser.role) {
      await AuditLogger.logUserOperation(
        AUDIT_EVENTS.USER_ROLE_CHANGED,
        req.user.user_id,
        req.user.username,
        userId,
        { role: oldUser.role },
        { role: req.body.role },
        req.ip
      );
    }
    
    await AuditLogger.logUserOperation(
      AUDIT_EVENTS.USER_UPDATED,
      req.user.user_id,
      req.user.username,
      userId,
      oldUser,
      updatedUser,
      req.ip
    );
    
    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

// DELETE /api/admin/users/:userId - Delete user (soft delete)
router.delete('/users/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent self-deletion
    if (userId === req.user.user_id) {
      return res.status(400).json({
        message: 'Cannot delete your own account'
      });
    }
    
    const oldUser = await UserManager.getUserById(userId);
    if (!oldUser) {
      return res.status(404).json({
        message: 'User not found'
      });
    }
    
    const deletedUser = await UserManager.deleteUser(userId, req.user.user_id);
    
    await AuditLogger.logUserOperation(
      AUDIT_EVENTS.USER_DELETED,
      req.user.user_id,
      req.user.username,
      userId,
      oldUser,
      deletedUser,
      req.ip
    );
    
    res.status(200).json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

// GET /api/admin/users/roles - Get available roles
router.get('/users/roles', requirePermission('users.read'), async (req, res) => {
  try {
    const roles = UserManager.getAvailableRoles();
    res.status(200).json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      message: 'Failed to retrieve roles',
      error: error.message
    });
  }
});

/**
 * CERTIFICATE MANAGEMENT ROUTES
 */

// GET /api/admin/certificates - List certificates
router.get('/certificates', requirePermission('certificates.read'), async (req, res) => {
  try {
    const { user_type, status, user_id } = req.query;
    const filters = {};
    
    if (user_type) filters.user_type = user_type;
    if (status) filters.status = status;
    if (user_id) filters.user_id = user_id;
    
    const certificates = await CertificateManager.listCertificates(filters);
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'certificates',
      action: 'list'
    });
    
    res.status(200).json({
      certificates,
      total: certificates.length,
      filters_applied: filters
    });
  } catch (error) {
    console.error('List certificates error:', error);
    res.status(500).json({
      message: 'Failed to retrieve certificates',
      error: error.message
    });
  }
});

// GET /api/admin/certificates/:certificateId - Get specific certificate
router.get('/certificates/:certificateId', requirePermission('certificates.read'), async (req, res) => {
  try {
    const { certificateId } = req.params;
    const certificate = await CertificateManager.getCertificate(certificateId);
    
    if (!certificate) {
      return res.status(404).json({
        message: 'Certificate not found'
      });
    }
    
    // Remove private key from response for security
    const { private_key_pem, ...certificateResponse } = certificate;
    
    await AuditLogger.logCertificateOperation(
      AUDIT_EVENTS.ADMIN_ACCESS,
      req.user.user_id,
      req.user.username,
      certificateId,
      req.ip
    );
    
    res.status(200).json({ certificate: certificateResponse });
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({
      message: 'Failed to retrieve certificate',
      error: error.message
    });
  }
});

// POST /api/admin/certificates - Generate new certificate
router.post('/certificates', requirePermission('certificates.create'), async (req, res) => {
  try {
    const { user_id, user_type, common_name, validity_days = 365 } = req.body;
    
    if (!user_id || !user_type || !common_name) {
      return res.status(400).json({
        message: 'user_id, user_type, and common_name are required'
      });
    }
    
    // Verify user exists
    const user = await UserManager.getUserById(user_id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }
    
    const certificate = await CertificateManager.generateCertificate(
      user_id,
      user_type,
      common_name,
      validity_days
    );
    
    await AuditLogger.logCertificateOperation(
      AUDIT_EVENTS.CERTIFICATE_GENERATED,
      req.user.user_id,
      req.user.username,
      certificate.certificate_id,
      req.ip,
      { target_user: user_id, user_type, validity_days }
    );
    
    res.status(201).json({
      message: 'Certificate generated successfully',
      certificate
    });
  } catch (error) {
    console.error('Generate certificate error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

// POST /api/admin/certificates/:certificateId/revoke - Revoke certificate
router.post('/certificates/:certificateId/revoke', requirePermission('certificates.revoke'), async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { reason = 'unspecified' } = req.body;
    
    const result = await CertificateManager.revokeCertificate(certificateId, reason);
    
    await AuditLogger.logCertificateOperation(
      AUDIT_EVENTS.CERTIFICATE_REVOKED,
      req.user.user_id,
      req.user.username,
      certificateId,
      req.ip,
      { reason }
    );
    
    res.status(200).json({
      message: 'Certificate revoked successfully',
      ...result
    });
  } catch (error) {
    console.error('Revoke certificate error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

// GET /api/admin/certificates/:certificateId/qrcode - Generate QR code for certificate
router.get('/certificates/:certificateId/qrcode', requirePermission('certificates.read'), async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { format = 'png', base_url } = req.query;
    
    // Determine base URL
    const baseUrl = base_url || `${req.protocol}://${req.get('host')}`;
    
    let qrResult;
    if (format === 'svg') {
      qrResult = await CertificateManager.generateQRCodeSVG(certificateId, baseUrl);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.status(200).send(qrResult.qr_code_svg);
    } else {
      qrResult = await CertificateManager.generateQRCode(certificateId, baseUrl);
      
      if (format === 'json') {
        res.status(200).json(qrResult);
      } else {
        // Return PNG image
        const base64Data = qrResult.qr_code_data_url.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.setHeader('Content-Type', 'image/png');
        res.status(200).send(imgBuffer);
      }
    }
    
    // Log QR code generation
    await AuditLogger.logCertificateOperation(
      AUDIT_EVENTS.ADMIN_ACCESS,
      req.user.user_id,
      req.user.username,
      certificateId,
      req.ip,
      { action: 'qr_code_generated', format }
    );
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(400).json({
      message: error.message
    });
  }
});

/**
 * AUDIT LOG ROUTES
 */

// GET /api/admin/audit - Get audit logs
router.get('/audit', requirePermission('audit.read'), async (req, res) => {
  try {
    const {
      user_id,
      event_type,
      risk_level,
      start_date,
      end_date,
      success,
      resource,
      ip_address,
      limit = 100,
      offset = 0
    } = req.query;
    
    const filters = {};
    if (user_id) filters.user_id = user_id;
    if (event_type) filters.event_type = event_type;
    if (risk_level) filters.risk_level = risk_level;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (success !== undefined) filters.success = success === 'true';
    if (resource) filters.resource = resource;
    if (ip_address) filters.ip_address = ip_address;
    
    const logs = await AuditLogger.getAuditLogs(
      filters,
      parseInt(limit),
      parseInt(offset)
    );
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'audit_logs',
      action: 'read'
    });
    
    res.status(200).json({
      logs,
      total: logs.length,
      filters_applied: filters,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      message: 'Failed to retrieve audit logs',
      error: error.message
    });
  }
});

// GET /api/admin/audit/stats - Get audit statistics
router.get('/audit/stats', requirePermission('audit.read'), async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const stats = await AuditLogger.getAuditStats(timeframe);
    
    res.status(200).json({
      timeframe,
      statistics: stats
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      message: 'Failed to retrieve audit statistics',
      error: error.message
    });
  }
});

// GET /api/admin/audit/alerts - Get security alerts
router.get('/audit/alerts', requirePermission('audit.read'), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const alerts = await AuditLogger.getSecurityAlerts(parseInt(limit));
    
    res.status(200).json({
      alerts,
      total: alerts.length
    });
  } catch (error) {
    console.error('Get security alerts error:', error);
    res.status(500).json({
      message: 'Failed to retrieve security alerts',
      error: error.message
    });
  }
});

// GET /api/admin/audit/export - Export audit logs
router.get('/audit/export', requirePermission('audit.read'), async (req, res) => {
  try {
    const {
      format = 'json',
      user_id,
      event_type,
      risk_level,
      start_date,
      end_date,
      success,
      resource,
      ip_address
    } = req.query;
    
    const filters = {};
    if (user_id) filters.user_id = user_id;
    if (event_type) filters.event_type = event_type;
    if (risk_level) filters.risk_level = risk_level;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (success !== undefined) filters.success = success === 'true';
    if (resource) filters.resource = resource;
    if (ip_address) filters.ip_address = ip_address;
    
    const exportData = await AuditLogger.exportAuditLogs(filters, format);
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'audit_logs',
      action: 'export',
      additional_data: { format, filters }
    });
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.status(200).send(exportData);
    } else {
      res.status(200).json(exportData);
    }
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
});

/**
 * DASHBOARD/OVERVIEW ROUTES
 */

// GET /api/admin/dashboard - Get admin dashboard overview
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [
      users,
      certificates,
      auditStats,
      securityAlerts
    ] = await Promise.all([
      UserManager.listUsers(),
      CertificateManager.listCertificates(),
      AuditLogger.getAuditStats('24h'),
      AuditLogger.getSecurityAlerts(10)
    ]);
    
    const dashboard = {
      summary: {
        total_users: users.length,
        active_users: users.filter(u => u.status === 'ACTIVE').length,
        total_certificates: certificates.length,
        active_certificates: certificates.filter(c => c.status === 'ACTIVE').length,
        revoked_certificates: certificates.filter(c => c.status === 'REVOKED').length
      },
      user_breakdown: {
        by_role: users.reduce((acc, user) => {
          acc[user.role] = (acc[user.role] || 0) + 1;
          return acc;
        }, {}),
        by_status: users.reduce((acc, user) => {
          acc[user.status] = (acc[user.status] || 0) + 1;
          return acc;
        }, {})
      },
      certificate_breakdown: {
        by_type: certificates.reduce((acc, cert) => {
          acc[cert.user_type] = (acc[cert.user_type] || 0) + 1;
          return acc;
        }, {}),
        by_status: certificates.reduce((acc, cert) => {
          acc[cert.status] = (acc[cert.status] || 0) + 1;
          return acc;
        }, {})
      },
      audit_summary: auditStats,
      recent_alerts: securityAlerts.slice(0, 5)
    };
    
    await AuditLogger.logEvent(AUDIT_EVENTS.ADMIN_ACCESS, {
      user_id: req.user.user_id,
      username: req.user.username,
      ip_address: req.ip,
      resource: 'dashboard',
      action: 'view'
    });
    
    res.status(200).json(dashboard);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      message: 'Failed to load dashboard',
      error: error.message
    });
  }
});

module.exports = router;