const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { withImmudb, objToBuffer, bufferToObj } = require('../immudb-client');
const { generateUuid } = require('./helpers');
const { Buffer } = require('buffer');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const SALT_ROUNDS = 12;

// User roles and their permissions
const USER_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Administrator',
    permissions: ['*'] // All permissions
  },
  ADMIN: {
    name: 'Administrator',
    permissions: [
      'users.create', 'users.read', 'users.update', 'users.delete',
      'certificates.create', 'certificates.read', 'certificates.revoke',
      'audit.read', 'inventory.read', 'inventory.write', 'products.read', 'products.write'
    ]
  },
  USER: {
    name: 'Regular User',
    permissions: [
      'inventory.read', 'inventory.write', 'products.read', 'products.write'
    ]
  },
  INTEGRATOR: {
    name: 'API Integrator',
    permissions: [
      'inventory.read', 'products.read', 'certificates.read'
    ]
  },
  READ_ONLY: {
    name: 'Read Only User',
    permissions: [
      'inventory.read', 'products.read'
    ]
  }
};

class UserManager {
  constructor() {
    this.initializeDefaultAdmin();
  }

  /**
   * Initialize default admin user if not exists
   */
  async initializeDefaultAdmin() {
    try {
      const adminExists = await this.getUserByUsername('admin');
      if (!adminExists) {
        await this.createUser({
          username: 'admin',
          password: 'admin123!', // Should be changed on first login
          email: 'admin@immudb-inventory.local',
          full_name: 'System Administrator',
          role: 'SUPER_ADMIN',
          created_by: 'SYSTEM'
        });
        console.log('Default admin user created - Username: admin, Password: admin123!');
      }
    } catch (error) {
      console.error('Error initializing default admin:', error);
    }
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    const {
      username,
      password,
      email,
      full_name,
      role = 'USER',
      permissions = null,
      created_by = 'SYSTEM'
    } = userData;

    // Validate required fields
    if (!username || !password || !email || !full_name) {
      throw new Error('Missing required fields: username, password, email, full_name');
    }

    // Validate role
    if (!USER_ROLES[role]) {
      throw new Error(`Invalid role: ${role}. Valid roles: ${Object.keys(USER_ROLES).join(', ')}`);
    }

    // Check if user already exists
    const existingUser = await this.getUserByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingEmail = await this.getUserByEmail(email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    const userId = generateUuid();
    const now = new Date().toISOString();

    const user = {
      user_id: userId,
      username,
      password_hash: passwordHash,
      email,
      full_name,
      role,
      permissions: permissions || USER_ROLES[role].permissions,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      created_by,
      last_login: null,
      failed_login_attempts: 0,
      locked_until: null,
      password_changed_at: now,
      requires_password_change: role === 'SUPER_ADMIN' && created_by === 'SYSTEM'
    };

    await withImmudb(async (client) => {
      // Store user by ID
      await client.set({
        key: Buffer.from(`user:${userId}`),
        value: objToBuffer(user)
      });

      // Store username mapping for login
      await client.set({
        key: Buffer.from(`username:${username}`),
        value: objToBuffer({ user_id: userId })
      });

      // Store email mapping
      await client.set({
        key: Buffer.from(`email:${email}`),
        value: objToBuffer({ user_id: userId })
      });
    });

    // Remove password hash from response
    const { password_hash, ...userResponse } = user;
    return userResponse;
  }

  /**
   * Authenticate user and return JWT token
   */
  async authenticateUser(username, password) {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('Account is inactive');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error('Account is temporarily locked');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await this.incrementFailedLogin(user.user_id);
      throw new Error('Invalid credentials');
    }

    // Reset failed login attempts and update last login
    await this.updateLastLogin(user.user_id);

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password_hash, ...userResponse } = user;
    return {
      user: userResponse,
      token,
      expires_in: '24h'
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Check if user has permission
   */
  hasPermission(userPermissions, requiredPermission) {
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return false;
    }

    // Super admin has all permissions
    if (userPermissions.includes('*')) {
      return true;
    }

    return userPermissions.includes(requiredPermission);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    try {
      return await withImmudb(async (client) => {
        const usernameResponse = await client.get({
          key: Buffer.from(`username:${username}`)
        });
        
        const { user_id } = bufferToObj(usernameResponse.value);
        
        const userResponse = await client.get({
          key: Buffer.from(`user:${user_id}`)
        });
        
        return bufferToObj(userResponse.value);
      });
    } catch (error) {
      if (error.message && error.message.includes('key not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    try {
      return await withImmudb(async (client) => {
        const emailResponse = await client.get({
          key: Buffer.from(`email:${email}`)
        });
        
        const { user_id } = bufferToObj(emailResponse.value);
        
        const userResponse = await client.get({
          key: Buffer.from(`user:${user_id}`)
        });
        
        return bufferToObj(userResponse.value);
      });
    } catch (error) {
      if (error.message && error.message.includes('key not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      return await withImmudb(async (client) => {
        const userResponse = await client.get({
          key: Buffer.from(`user:${userId}`)
        });
        
        return bufferToObj(userResponse.value);
      });
    } catch (error) {
      if (error.message && error.message.includes('key not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates, updatedBy) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate role if being updated
    if (updates.role && !USER_ROLES[updates.role]) {
      throw new Error(`Invalid role: ${updates.role}`);
    }

    // Hash new password if provided
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, SALT_ROUNDS);
      updates.password_changed_at = new Date().toISOString();
      delete updates.password;
    }

    // Update permissions if role changed
    if (updates.role && updates.role !== user.role) {
      updates.permissions = USER_ROLES[updates.role].permissions;
    }

    const updatedUser = {
      ...user,
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy
    };

    await withImmudb(async (client) => {
      await client.set({
        key: Buffer.from(`user:${userId}`),
        value: objToBuffer(updatedUser)
      });

      // Update username mapping if username changed
      if (updates.username && updates.username !== user.username) {
        await client.set({
          key: Buffer.from(`username:${updates.username}`),
          value: objToBuffer({ user_id: userId })
        });
      }

      // Update email mapping if email changed
      if (updates.email && updates.email !== user.email) {
        await client.set({
          key: Buffer.from(`email:${updates.email}`),
          value: objToBuffer({ user_id: userId })
        });
      }
    });

    const { password_hash, ...userResponse } = updatedUser;
    return userResponse;
  }

  /**
   * Delete user (soft delete)
   */
  async deleteUser(userId, deletedBy) {
    return await this.updateUser(userId, {
      status: 'DELETED',
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy
    }, deletedBy);
  }

  /**
   * List all users with filtering
   */
  async listUsers(filters = {}) {
    return await withImmudb(async (client) => {
      const users = [];
      
      try {
        const scanResponse = await client.scan({
          seekKey: Buffer.from('user:'),
          limit: 1000,
          desc: false
        });

        for (const item of scanResponse.entriesList) {
          const key = item.key.toString();
          if (key.startsWith('user:')) {
            try {
              const userData = bufferToObj(Buffer.from(item.value));
              
              // Apply filters
              if (filters.role && userData.role !== filters.role) continue;
              if (filters.status && userData.status !== filters.status) continue;
              
              // Remove sensitive data
              const { password_hash, ...userResponse } = userData;
              users.push(userResponse);
            } catch (parseError) {
              continue; // Skip invalid entries
            }
          }
        }
        
        return users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } catch (scanError) {
        console.error('Error scanning users:', scanError);
        return [];
      }
    });
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedLogin(userId) {
    const user = await this.getUserById(userId);
    if (!user) return;

    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    const updates = {
      failed_login_attempts: failedAttempts
    };

    // Lock account after 5 failed attempts
    if (failedAttempts >= 5) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 30); // Lock for 30 minutes
      updates.locked_until = lockUntil.toISOString();
    }

    await this.updateUser(userId, updates, 'SYSTEM');
  }

  /**
   * Update last login and reset failed attempts
   */
  async updateLastLogin(userId) {
    await this.updateUser(userId, {
      last_login: new Date().toISOString(),
      failed_login_attempts: 0,
      locked_until: null
    }, 'SYSTEM');
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    await this.updateUser(userId, {
      password: newPassword,
      requires_password_change: false
    }, userId);

    return { message: 'Password changed successfully' };
  }

  /**
   * Get available roles
   */
  getAvailableRoles() {
    return Object.entries(USER_ROLES).map(([key, value]) => ({
      role: key,
      name: value.name,
      permissions: value.permissions
    }));
  }
}

module.exports = { UserManager: new UserManager(), USER_ROLES };