const { withImmudb, objToBuffer, bufferToObj } = require('../immudb-client');
const { generateUuid } = require('./helpers');
const { Buffer } = require('buffer');

// Audit event types
const AUDIT_EVENTS = {
  // Authentication events
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  
  // User management events
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  
  // Certificate management events
  CERTIFICATE_GENERATED: 'CERTIFICATE_GENERATED',
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
  CERTIFICATE_VALIDATED: 'CERTIFICATE_VALIDATED',
  CERTIFICATE_VALIDATION_FAILED: 'CERTIFICATE_VALIDATION_FAILED',
  CERTIFICATE_VERIFIED: 'CERTIFICATE_VERIFIED',
  CERTIFICATE_LOOKUP: 'CERTIFICATE_LOOKUP',
  CERTIFICATE_STATUS_CHECK: 'CERTIFICATE_STATUS_CHECK',
  
  // Inventory events
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_ACCESSED: 'PRODUCT_ACCESSED',
  INVENTORY_TRANSACTION: 'INVENTORY_TRANSACTION',
  INVENTORY_QUERY: 'INVENTORY_QUERY',
  TIME_TRAVEL_QUERY: 'TIME_TRAVEL_QUERY',
  
  // Administrative events
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  CONFIGURATION_CHANGED: 'CONFIGURATION_CHANGED',
  SYSTEM_BACKUP: 'SYSTEM_BACKUP',
  SYSTEM_RESTORE: 'SYSTEM_RESTORE',
  
  // Security events
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  API_RATE_LIMIT_EXCEEDED: 'API_RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN_USED: 'INVALID_TOKEN_USED',
  
  // Data integrity events
  DATA_VERIFICATION_SUCCESS: 'DATA_VERIFICATION_SUCCESS',
  DATA_VERIFICATION_FAILED: 'DATA_VERIFICATION_FAILED',
  TRANSACTION_VERIFIED: 'TRANSACTION_VERIFIED'
};

// Risk levels
const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class AuditLogger {
  constructor() {
    this.events = AUDIT_EVENTS;
    this.riskLevels = RISK_LEVELS;
  }

  /**
   * Log audit event
   */
  async logEvent(eventType, details) {
    const auditId = generateUuid();
    const timestamp = new Date().toISOString();
    
    // Determine risk level based on event type
    const riskLevel = this.determineRiskLevel(eventType);
    
    const auditEntry = {
      audit_id: auditId,
      event_type: eventType,
      timestamp,
      user_id: details.user_id || 'SYSTEM',
      username: details.username || 'system',
      ip_address: details.ip_address || null,
      user_agent: details.user_agent || null,
      session_id: details.session_id || null,
      resource: details.resource || null,
      action: details.action || null,
      resource_id: details.resource_id || null,
      old_values: details.old_values || null,
      new_values: details.new_values || null,
      success: details.success !== undefined ? details.success : true,
      error_message: details.error_message || null,
      risk_level: riskLevel,
      additional_data: details.additional_data || {},
      correlation_id: details.correlation_id || null
    };

    try {
      await withImmudb(async (client) => {
        // Store by audit ID
        await client.set({
          key: Buffer.from(`audit:${auditId}`),
          value: objToBuffer(auditEntry)
        });

        // Store by timestamp for chronological queries
        const timestampKey = `audit_by_time:${timestamp}:${auditId}`;
        await client.set({
          key: Buffer.from(timestampKey),
          value: objToBuffer({ audit_id: auditId })
        });

        // Store by user for user-specific queries
        if (details.user_id && details.user_id !== 'SYSTEM') {
          const userAuditKey = `audit_by_user:${details.user_id}:${timestamp}:${auditId}`;
          await client.set({
            key: Buffer.from(userAuditKey),
            value: objToBuffer({ audit_id: auditId })
          });
        }

        // Store by event type for filtering
        const eventTypeKey = `audit_by_event:${eventType}:${timestamp}:${auditId}`;
        await client.set({
          key: Buffer.from(eventTypeKey),
          value: objToBuffer({ audit_id: auditId })
        });

        // Store high-risk events separately for monitoring
        if (riskLevel === RISK_LEVELS.HIGH || riskLevel === RISK_LEVELS.CRITICAL) {
          const riskKey = `audit_by_risk:${riskLevel}:${timestamp}:${auditId}`;
          await client.set({
            key: Buffer.from(riskKey),
            value: objToBuffer({ audit_id: auditId })
          });
        }
      });

      // Log critical events to console for immediate attention
      if (riskLevel === RISK_LEVELS.CRITICAL) {
        console.warn(`🚨 CRITICAL AUDIT EVENT: ${eventType}`, {
          user: details.username || 'system',
          resource: details.resource,
          ip: details.ip_address,
          timestamp
        });
      }

      return auditId;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      throw error;
    }
  }

  /**
   * Determine risk level based on event type
   */
  determineRiskLevel(eventType) {
    const criticalEvents = [
      AUDIT_EVENTS.USER_DELETED,
      AUDIT_EVENTS.CERTIFICATE_REVOKED,
      AUDIT_EVENTS.CONFIGURATION_CHANGED,
      AUDIT_EVENTS.SYSTEM_RESTORE,
      AUDIT_EVENTS.DATA_VERIFICATION_FAILED
    ];

    const highRiskEvents = [
      AUDIT_EVENTS.LOGIN_FAILED,
      AUDIT_EVENTS.USER_ROLE_CHANGED,
      AUDIT_EVENTS.UNAUTHORIZED_ACCESS_ATTEMPT,
      AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
      AUDIT_EVENTS.INVALID_TOKEN_USED,
      AUDIT_EVENTS.CERTIFICATE_VALIDATION_FAILED
    ];

    const mediumRiskEvents = [
      AUDIT_EVENTS.USER_CREATED,
      AUDIT_EVENTS.USER_UPDATED,
      AUDIT_EVENTS.CERTIFICATE_GENERATED,
      AUDIT_EVENTS.PASSWORD_CHANGED,
      AUDIT_EVENTS.API_RATE_LIMIT_EXCEEDED
    ];

    if (criticalEvents.includes(eventType)) {
      return RISK_LEVELS.CRITICAL;
    } else if (highRiskEvents.includes(eventType)) {
      return RISK_LEVELS.HIGH;
    } else if (mediumRiskEvents.includes(eventType)) {
      return RISK_LEVELS.MEDIUM;
    } else {
      return RISK_LEVELS.LOW;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(filters = {}, limit = 100, offset = 0) {
    try {
      return await withImmudb(async (client) => {
        const auditLogs = [];
        let scanKey = 'audit_by_time:';
        
        // Adjust scan key based on filters
        if (filters.user_id) {
          scanKey = `audit_by_user:${filters.user_id}:`;
        } else if (filters.event_type) {
          scanKey = `audit_by_event:${filters.event_type}:`;
        } else if (filters.risk_level) {
          scanKey = `audit_by_risk:${filters.risk_level}:`;
        }

        const scanResponse = await client.scan({
          seekKey: Buffer.from(scanKey),
          limit: limit + offset,
          desc: true // Most recent first
        });

        const promises = [];
        let processed = 0;
        
        for (const item of scanResponse.entriesList) {
          const key = item.key.toString();
          if (key.startsWith(scanKey.replace(':', '_by_'))) {
            if (processed < offset) {
              processed++;
              continue;
            }
            
            if (promises.length >= limit) break;
            
            try {
              const { audit_id } = bufferToObj(Buffer.from(item.value));
              promises.push(this.getAuditById(audit_id));
            } catch (parseError) {
              continue;
            }
          }
        }

        const resolvedLogs = await Promise.all(promises);
        
        // Apply additional filters
        const filteredLogs = resolvedLogs.filter(log => {
          if (!log) return false;
          
          if (filters.start_date && log.timestamp < filters.start_date) return false;
          if (filters.end_date && log.timestamp > filters.end_date) return false;
          if (filters.success !== undefined && log.success !== filters.success) return false;
          if (filters.resource && log.resource !== filters.resource) return false;
          if (filters.ip_address && log.ip_address !== filters.ip_address) return false;
          
          return true;
        });

        return filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      });
    } catch (error) {
      console.error('Error retrieving audit logs:', error);
      return [];
    }
  }

  /**
   * Get audit log by ID
   */
  async getAuditById(auditId) {
    try {
      return await withImmudb(async (client) => {
        const response = await client.get({
          key: Buffer.from(`audit:${auditId}`)
        });
        
        return bufferToObj(response.value);
      });
    } catch (error) {
      if (error.message && error.message.includes('key not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(timeframe = '24h') {
    try {
      const now = new Date();
      const startTime = new Date();
      
      // Calculate start time based on timeframe
      switch (timeframe) {
        case '1h':
          startTime.setHours(now.getHours() - 1);
          break;
        case '24h':
          startTime.setDate(now.getDate() - 1);
          break;
        case '7d':
          startTime.setDate(now.getDate() - 7);
          break;
        case '30d':
          startTime.setDate(now.getDate() - 30);
          break;
        default:
          startTime.setDate(now.getDate() - 1);
      }

      const logs = await this.getAuditLogs({
        start_date: startTime.toISOString(),
        end_date: now.toISOString()
      }, 10000); // Large limit for stats

      // Calculate statistics
      const stats = {
        total_events: logs.length,
        successful_events: logs.filter(log => log.success).length,
        failed_events: logs.filter(log => !log.success).length,
        unique_users: new Set(logs.map(log => log.user_id)).size,
        unique_ip_addresses: new Set(logs.filter(log => log.ip_address).map(log => log.ip_address)).size,
        events_by_type: {},
        events_by_risk_level: {},
        events_by_hour: {},
        top_users: {},
        top_resources: {}
      };

      // Group by event type
      logs.forEach(log => {
        stats.events_by_type[log.event_type] = (stats.events_by_type[log.event_type] || 0) + 1;
        stats.events_by_risk_level[log.risk_level] = (stats.events_by_risk_level[log.risk_level] || 0) + 1;
        
        // Group by hour
        const hour = new Date(log.timestamp).getHours();
        stats.events_by_hour[hour] = (stats.events_by_hour[hour] || 0) + 1;
        
        // Top users
        if (log.username && log.username !== 'system') {
          stats.top_users[log.username] = (stats.top_users[log.username] || 0) + 1;
        }
        
        // Top resources
        if (log.resource) {
          stats.top_resources[log.resource] = (stats.top_resources[log.resource] || 0) + 1;
        }
      });

      // Convert to sorted arrays for top users/resources
      stats.top_users = Object.entries(stats.top_users)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([user, count]) => ({ user, count }));

      stats.top_resources = Object.entries(stats.top_resources)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([resource, count]) => ({ resource, count }));

      return stats;
    } catch (error) {
      console.error('Error calculating audit statistics:', error);
      return null;
    }
  }

  /**
   * Get security alerts (high-risk events)
   */
  async getSecurityAlerts(limit = 50) {
    const highRiskLogs = await this.getAuditLogs({
      risk_level: RISK_LEVELS.HIGH
    }, limit);

    const criticalRiskLogs = await this.getAuditLogs({
      risk_level: RISK_LEVELS.CRITICAL
    }, limit);

    return [...criticalRiskLogs, ...highRiskLogs]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(filters = {}, format = 'json') {
    const logs = await this.getAuditLogs(filters, 10000); // Large limit for export
    
    if (format === 'csv') {
      return this.convertToCSV(logs);
    }
    
    return {
      export_timestamp: new Date().toISOString(),
      filters_applied: filters,
      total_records: logs.length,
      audit_logs: logs
    };
  }

  /**
   * Convert logs to CSV format
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]);
    const csvContent = [
      headers.join(','),
      ...logs.map(log => 
        headers.map(header => {
          const value = log[header];
          if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value || '').replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    return csvContent;
  }

  /**
   * Helper methods for common audit events
   */
  async logLogin(username, userId, ipAddress, userAgent, success = true, errorMessage = null) {
    return await this.logEvent(success ? AUDIT_EVENTS.LOGIN_SUCCESS : AUDIT_EVENTS.LOGIN_FAILED, {
      user_id: userId,
      username,
      ip_address: ipAddress,
      user_agent: userAgent,
      resource: 'authentication',
      action: 'login',
      success,
      error_message: errorMessage
    });
  }

  async logUserOperation(eventType, performerId, performerUsername, targetUserId, oldValues = null, newValues = null, ipAddress = null) {
    return await this.logEvent(eventType, {
      user_id: performerId,
      username: performerUsername,
      ip_address: ipAddress,
      resource: 'user_management',
      action: eventType.toLowerCase(),
      resource_id: targetUserId,
      old_values: oldValues,
      new_values: newValues
    });
  }

  async logCertificateOperation(eventType, userId, username, certificateId, ipAddress = null, additionalData = {}) {
    return await this.logEvent(eventType, {
      user_id: userId,
      username,
      ip_address: ipAddress,
      resource: 'certificate',
      action: eventType.toLowerCase(),
      resource_id: certificateId,
      additional_data: additionalData
    });
  }

  async logInventoryOperation(eventType, userId, username, resourceId, ipAddress = null, additionalData = {}) {
    return await this.logEvent(eventType, {
      user_id: userId,
      username,
      ip_address: ipAddress,
      resource: 'inventory',
      action: eventType.toLowerCase(),
      resource_id: resourceId,
      additional_data: additionalData
    });
  }
}

module.exports = { AuditLogger: new AuditLogger(), AUDIT_EVENTS, RISK_LEVELS };