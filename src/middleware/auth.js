const { UserManager } = require('../utils/user-manager');
const { AuditLogger, AUDIT_EVENTS } = require('../utils/audit-logger');
const rateLimit = require('express-rate-limit');
const CertificateManager = require('../utils/certificate-manager');

const API_KEY = process.env.API_KEY || 'supersecretapikey'; // Legacy API key for backward compatibility

/**
 * Legacy API Key authentication (backward compatibility)
 */
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid or missing API Key'
    });
  }
  
  // Add basic user info for legacy API key
  req.user = {
    user_id: 'legacy-api-key',
    username: 'legacy-user',
    role: 'USER',
    permissions: ['inventory.read', 'inventory.write', 'products.read', 'products.write']
  };
  
  next();
};

/**
 * JWT Token authentication
 */
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Unauthorized: Missing or invalid authorization header'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = UserManager.verifyToken(token);
      
      // Get current user info to ensure account is still active
      const user = await UserManager.getUserById(decoded.user_id);
      if (!user || user.status !== 'ACTIVE') {
        await AuditLogger.logEvent(AUDIT_EVENTS.INVALID_TOKEN_USED, {
          user_id: decoded.user_id,
          username: decoded.username,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          error_message: 'Account inactive or not found'
        });
        
        return res.status(401).json({
          message: 'Unauthorized: Account inactive'
        });
      }
      
      // Attach user info to request
      req.user = {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        email: user.email,
        full_name: user.full_name
      };
      
      next();
    } catch (tokenError) {
      await AuditLogger.logEvent(AUDIT_EVENTS.INVALID_TOKEN_USED, {
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        error_message: tokenError.message
      });
      
      return res.status(401).json({
        message: 'Unauthorized: Invalid token'
      });
    }
  } catch (error) {
    console.error('JWT Authentication error:', error);
    return res.status(500).json({
      message: 'Authentication error'
    });
  }
};

/**
 * Certificate-based authentication
 */
const authenticateCertificate = async (req, res, next) => {
  try {
    const clientCert = req.headers['x-client-certificate'];
    
    if (!clientCert) {
      return res.status(401).json({
        message: 'Unauthorized: Client certificate required'
      });
    }
    
    // Validate certificate
    const validation = await CertificateManager.validateCertificate(clientCert);
    
    if (!validation.valid) {
      await AuditLogger.logCertificateOperation(
        AUDIT_EVENTS.CERTIFICATE_VALIDATION_FAILED,
        'unknown',
        'unknown',
        'unknown',
        req.ip,
        { reason: validation.reason }
      );
      
      return res.status(401).json({
        message: `Certificate validation failed: ${validation.reason}`
      });
    }
    
    // Get user associated with certificate
    const user = await UserManager.getUserById(validation.certificate_data.user_id);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        message: 'Unauthorized: User account inactive'
      });
    }
    
    // Log successful certificate validation
    await AuditLogger.logCertificateOperation(
      AUDIT_EVENTS.CERTIFICATE_VALIDATED,
      user.user_id,
      user.username,
      validation.certificate_data.certificate_id,
      req.ip
    );
    
    // Attach user info to request
    req.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      email: user.email,
      full_name: user.full_name,
      auth_method: 'certificate',
      certificate_id: validation.certificate_data.certificate_id
    };
    
    next();
  } catch (error) {
    console.error('Certificate authentication error:', error);
    return res.status(500).json({
      message: 'Certificate authentication error'
    });
  }
};

/**
 * Flexible authentication - supports JWT, Certificate, or Legacy API Key
 */
const authenticate = async (req, res, next) => {
  // Check for JWT token first
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  
  // Check for client certificate
  if (req.headers['x-client-certificate']) {
    return authenticateCertificate(req, res, next);
  }
  
  // Fall back to legacy API key
  if (req.headers['x-api-key']) {
    return authenticateApiKey(req, res, next);
  }
  
  return res.status(401).json({
    message: 'Unauthorized: No valid authentication method provided'
  });
};

/**
 * Role-based access control
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Unauthorized: Authentication required'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      AuditLogger.logEvent(AUDIT_EVENTS.UNAUTHORIZED_ACCESS_ATTEMPT, {
        user_id: req.user.user_id,
        username: req.user.username,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        resource: req.path,
        error_message: `Role ${req.user.role} not in allowed roles: ${allowedRoles.join(', ')}`
      });
      
      return res.status(403).json({
        message: 'Forbidden: Insufficient role permissions'
      });
    }
    
    next();
  };
};

/**
 * Permission-based access control
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Unauthorized: Authentication required'
      });
    }
    
    if (!UserManager.hasPermission(req.user.permissions, permission)) {
      AuditLogger.logEvent(AUDIT_EVENTS.UNAUTHORIZED_ACCESS_ATTEMPT, {
        user_id: req.user.user_id,
        username: req.user.username,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        resource: req.path,
        error_message: `Missing required permission: ${permission}`
      });
      
      return res.status(403).json({
        message: `Forbidden: Missing required permission: ${permission}`
      });
    }
    
    next();
  };
};

/**
 * Rate limiting middleware
 */
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: { message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
      // Log rate limit exceeded
      await AuditLogger.logEvent(AUDIT_EVENTS.API_RATE_LIMIT_EXCEEDED, {
        user_id: req.user?.user_id || 'anonymous',
        username: req.user?.username || 'anonymous',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        resource: req.path
      });
      
      res.status(429).json({ message });
    }
  });
};

// Pre-configured rate limits
const rateLimits = {
  strict: createRateLimit(15 * 60 * 1000, 50, 'Too many requests - strict limit'),  // 50 requests per 15 minutes
  normal: createRateLimit(15 * 60 * 1000, 100, 'Too many requests'),               // 100 requests per 15 minutes
  lenient: createRateLimit(15 * 60 * 1000, 200, 'Too many requests'),             // 200 requests per 15 minutes
  auth: createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts')    // 5 auth attempts per 15 minutes
};

/**
 * Admin-only middleware
 */
const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');

/**
 * Super admin only middleware
 */
const requireSuperAdmin = requireRole('SUPER_ADMIN');

module.exports = {
  // Legacy
  authenticateApiKey,
  
  // New authentication methods
  authenticateJWT,
  authenticateCertificate,
  authenticate,
  
  // Authorization
  requireRole,
  requirePermission,
  requireAdmin,
  requireSuperAdmin,
  
  // Rate limiting
  createRateLimit,
  rateLimits
};
