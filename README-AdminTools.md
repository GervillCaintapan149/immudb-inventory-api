# Administrative Tooling - ImmuDB Inventory Management System

This document describes the comprehensive administrative tooling implemented for the ImmuDB Inventory Management System, covering certificate management, user/integrator management, and enhanced audit trails.

## 🏗️ Architecture Overview

The administrative system is built with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│                    Administrative Layer                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│   User Mgmt     │   Certificate   │      Audit System      │
│   - JWT Auth    │   Management    │   - Event Logging      │
│   - RBAC        │   - X.509 Certs│   - Risk Assessment    │
│   - Permissions │   - CA System   │   - Compliance Export  │
└─────────────────┴─────────────────┴─────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ImmuDB Storage Layer                     │
│   - Immutable audit logs    - Certificate storage          │
│   - User data              - CA certificates               │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Authentication & Authorization

### Authentication Methods

The system supports multiple authentication methods:

1. **JWT Tokens** (Primary for admin operations)
2. **X.509 Certificates** (For integrator access)
3. **API Keys** (Legacy support, backward compatible)

### User Roles & Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| `SUPER_ADMIN` | System Administrator | All permissions (`*`) |
| `ADMIN` | Administrator | User/Certificate/Audit management |
| `USER` | Regular User | Inventory read/write, Products |
| `INTEGRATOR` | API Integrator | Limited read access |
| `READ_ONLY` | Read Only User | View-only access |

### Permission System

Fine-grained permissions include:
- `users.create`, `users.read`, `users.update`, `users.delete`
- `certificates.create`, `certificates.read`, `certificates.revoke`
- `audit.read`, `inventory.read`, `inventory.write`
- `products.read`, `products.write`

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

New dependencies added:
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT token management  
- `node-forge` - X.509 certificate operations
- `express-rate-limit` - API rate limiting

### 2. Environment Variables

Add to your `.env` file:

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Legacy API Key (backward compatibility)
API_KEY=supersecretapikey

# Admin System
ADMIN_DEFAULT_PASSWORD=admin123!
```

### 3. Start the System

```bash
npm start
```

The system will automatically:
- Create a default admin user (`admin` / `admin123!`)
- Generate a root Certificate Authority
- Initialize audit logging

## 👤 User Management

### Default Admin Account

**Username:** `admin`  
**Password:** `admin123!` (change on first login)  
**Role:** `SUPER_ADMIN`

### Admin Authentication

#### Login
```bash
POST /api/admin/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123!"
}
```

Response:
```json
{
  "message": "Login successful",
  "user": {
    "user_id": "...",
    "username": "admin",
    "role": "SUPER_ADMIN",
    "permissions": ["*"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": "24h"
}
```

#### Change Password
```bash
POST /api/admin/auth/change-password
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "current_password": "admin123!",
  "new_password": "NewSecurePassword123!"
}
```

### User Management Operations

#### Create User
```bash
POST /api/admin/users
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "john_doe",
  "password": "SecurePassword123!",
  "email": "john.doe@example.com",
  "full_name": "John Doe",
  "role": "USER"
}
```

#### List Users
```bash
GET /api/admin/users?role=USER&status=ACTIVE
Authorization: Bearer <jwt_token>
```

#### Update User
```bash
PUT /api/admin/users/{userId}
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "role": "ADMIN",
  "status": "ACTIVE"
}
```

#### Delete User (Soft Delete)
```bash
DELETE /api/admin/users/{userId}
Authorization: Bearer <jwt_token>
```

## 📜 Certificate Management

### X.509 Certificate System

The system includes a complete Certificate Authority (CA) for issuing client certificates.

#### Certificate Generation
```bash
POST /api/admin/certificates
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "user_id": "user-uuid",
  "user_type": "INTEGRATOR",
  "common_name": "Integration Client",
  "validity_days": 365
}
```

Response:
```json
{
  "message": "Certificate generated successfully",
  "certificate": {
    "certificate_id": "abc123...",
    "certificate_pem": "-----BEGIN CERTIFICATE-----\n...",
    "private_key_pem": "-----BEGIN PRIVATE KEY-----\n...",
    "expires_at": "2025-10-20T04:00:00.000Z"
  }
}
```

#### List Certificates
```bash
GET /api/admin/certificates?user_type=INTEGRATOR&status=ACTIVE
Authorization: Bearer <jwt_token>
```

#### Revoke Certificate
```bash
POST /api/admin/certificates/{certificateId}/revoke
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "reason": "compromised"
}
```

### Using Certificates for Authentication

Include the certificate in the `X-Client-Certificate` header:

```bash
GET /api/products/LAPTOP-001
X-Client-Certificate: -----BEGIN CERTIFICATE-----\nMIIC...
```

## 📊 Audit Trail System

### Comprehensive Event Logging

The system logs all activities with risk assessment:

#### Event Categories:
- **Authentication**: Login/logout, password changes
- **User Management**: User CRUD operations, role changes
- **Certificate Management**: Generation, validation, revocation
- **Inventory Operations**: Product access, transactions, time-travel queries
- **Administrative**: Configuration changes, system access
- **Security**: Unauthorized access, suspicious activity, rate limiting

#### Risk Levels:
- `LOW`: Normal operations
- `MEDIUM`: User management, certificate operations
- `HIGH`: Failed logins, unauthorized access
- `CRITICAL`: User deletion, certificate revocation, data verification failures

### Audit Log Queries

#### Get Audit Logs
```bash
GET /api/admin/audit?risk_level=HIGH&limit=50&offset=0
Authorization: Bearer <jwt_token>
```

#### Audit Statistics
```bash
GET /api/admin/audit/stats?timeframe=24h
Authorization: Bearer <jwt_token>
```

Response includes:
- Event counts by type
- Success/failure rates
- Top users and resources
- Risk level breakdown
- Timeline analysis

#### Security Alerts
```bash
GET /api/admin/audit/alerts?limit=50
Authorization: Bearer <jwt_token>
```

#### Export Audit Logs
```bash
# JSON Export
GET /api/admin/audit/export?format=json&start_date=2023-01-01
Authorization: Bearer <jwt_token>

# CSV Export
GET /api/admin/audit/export?format=csv&risk_level=HIGH
Authorization: Bearer <jwt_token>
```

## 🛡️ Rate Limiting

### Rate Limit Configurations

| Type | Window | Requests | Applied To |
|------|--------|----------|------------|
| `strict` | 15 min | 50 | Admin routes |
| `normal` | 15 min | 100 | General API |
| `lenient` | 15 min | 200 | Public endpoints |
| `auth` | 15 min | 5 | Authentication |

### Rate Limit Headers

Response includes:
```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 48
X-RateLimit-Reset: 1634567890
```

## 📋 Admin Dashboard

### Dashboard Overview
```bash
GET /api/admin/dashboard
Authorization: Bearer <jwt_token>
```

Provides comprehensive system overview:

```json
{
  "summary": {
    "total_users": 15,
    "active_users": 12,
    "total_certificates": 8,
    "active_certificates": 6,
    "revoked_certificates": 2
  },
  "user_breakdown": {
    "by_role": {
      "ADMIN": 2,
      "USER": 10,
      "INTEGRATOR": 3
    }
  },
  "certificate_breakdown": {
    "by_type": {
      "USER": 3,
      "INTEGRATOR": 5
    }
  },
  "audit_summary": {
    "total_events": 1250,
    "failed_events": 15,
    "events_by_risk_level": {
      "HIGH": 8,
      "MEDIUM": 45
    }
  },
  "recent_alerts": []
}
```

## 🔍 API Documentation

### Authentication Headers

#### JWT Token
```
Authorization: Bearer <jwt_token>
```

#### Client Certificate
```
X-Client-Certificate: -----BEGIN CERTIFICATE-----\n...
```

#### Legacy API Key
```
X-API-Key: supersecretapikey
```

### Admin Routes Overview

| Method | Endpoint | Description | Permission Required |
|--------|----------|-------------|-------------------|
| `POST` | `/api/admin/auth/login` | Admin login | None |
| `POST` | `/api/admin/auth/change-password` | Change password | Authenticated user |
| `GET` | `/api/admin/users` | List users | `users.read` |
| `POST` | `/api/admin/users` | Create user | `users.create` |
| `PUT` | `/api/admin/users/{id}` | Update user | `users.update` |
| `DELETE` | `/api/admin/users/{id}` | Delete user | `SUPER_ADMIN` role |
| `GET` | `/api/admin/certificates` | List certificates | `certificates.read` |
| `POST` | `/api/admin/certificates` | Generate certificate | `certificates.create` |
| `POST` | `/api/admin/certificates/{id}/revoke` | Revoke certificate | `certificates.revoke` |
| `GET` | `/api/admin/audit` | Get audit logs | `audit.read` |
| `GET` | `/api/admin/audit/stats` | Audit statistics | `audit.read` |
| `GET` | `/api/admin/audit/alerts` | Security alerts | `audit.read` |
| `GET` | `/api/admin/audit/export` | Export audit logs | `audit.read` |
| `GET` | `/api/admin/dashboard` | Admin dashboard | `ADMIN` role |

## 🛠️ Troubleshooting

### Common Issues

#### 1. Default Admin Login Issues
```bash
# Reset admin password (requires server restart)
rm data/immudb/*  # This will recreate default admin
npm start
```

#### 2. Certificate Validation Errors
- Ensure certificate is not expired
- Check certificate hasn't been revoked
- Verify CA chain is valid

#### 3. JWT Token Issues
- Check token hasn't expired (24h lifetime)
- Verify JWT_SECRET is consistent
- Ensure user account is still active

#### 4. Rate Limiting
- Wait for rate limit window to reset
- Use different authentication method
- Contact admin to adjust limits

### Monitoring & Alerting

Critical events are automatically logged to console:
```
🚨 CRITICAL AUDIT EVENT: USER_DELETED
```

Consider setting up log monitoring for:
- Failed authentication attempts
- Certificate validation failures  
- Unauthorized access attempts
- Rate limit violations

## 🔒 Security Best Practices

### Production Deployment

1. **Change Default Credentials**
   ```bash
   # Change admin password immediately
   POST /api/admin/auth/change-password
   ```

2. **Secure JWT Secret**
   ```bash
   # Use strong, random JWT secret
   export JWT_SECRET=$(openssl rand -base64 64)
   ```

3. **Certificate Security**
   - Store private keys securely
   - Implement certificate rotation
   - Monitor certificate expiration

4. **Audit Log Retention**
   - Export logs regularly for compliance
   - Implement log rotation
   - Secure exported audit data

5. **Network Security**
   - Use HTTPS in production
   - Implement proper firewall rules
   - Consider certificate-based client authentication

### Compliance Features

- **Immutable Audit Trail**: All events stored in ImmuDB
- **Risk-based Monitoring**: Automatic risk level assessment
- **Export Capabilities**: JSON and CSV formats for compliance reporting
- **User Activity Tracking**: Complete user action history
- **Certificate Management**: Full PKI lifecycle management

## 🔄 Migration from Legacy API

### Backward Compatibility

Existing API key authentication continues to work:

```bash
# Legacy approach (still works)
GET /api/products/LAPTOP-001
X-API-Key: supersecretapikey

# New approach (recommended)
GET /api/products/LAPTOP-001  
Authorization: Bearer <jwt_token>
```

### Migration Path

1. **Create Admin Users**: Set up proper user accounts
2. **Generate Certificates**: For integrator systems
3. **Update Clients**: Gradually move to JWT/certificate auth
4. **Disable Legacy**: Remove API key support when ready

---

## 📞 Support

For technical support or questions about the administrative tooling:

1. Check the troubleshooting section
2. Review audit logs for error details
3. Consult the API documentation
4. Contact your system administrator

The administrative tooling provides enterprise-grade security and compliance features while maintaining the immutable audit trail that makes ImmuDB ideal for inventory management systems.