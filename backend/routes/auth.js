const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');

const router = express.Router();

// Middleware để xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// @route   POST /api/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { username, password } = req.body;
    console.log(`Login attempt for username: ${username}`);

    // Find admin user
    const query = 'SELECT id, username, password, email, is_active FROM admins WHERE username = ? AND is_active = 1';
    const result = await executeQuery(query, [username]);

    if (!result.success) {
      console.error('Database query error:', result.error);
      return res.status(500).json({
        success: false,
        message: 'Database connection error'
      });
    }

    console.log(`Database query result: found ${result.data.length} admin(s)`);

    if (result.data.length === 0) {
      // Check if admin table exists and has any records
      const checkAdmins = await executeQuery('SELECT COUNT(*) as count FROM admins');
      if (checkAdmins.success) {
        console.log(`Total admins in database: ${checkAdmins.data[0].count}`);
        if (checkAdmins.data[0].count === 0) {
          console.log('No admin accounts found, creating default admin...');
          // Create default admin account
          const bcrypt = require('bcryptjs');
          const hashedPassword = await bcrypt.hash('admin123', 12);
          const createAdmin = await executeQuery(
            'INSERT INTO admins (username, password, email, is_active) VALUES (?, ?, ?, ?)',
            ['admin', hashedPassword, 'admin@example.com', 1]
          );
          if (createAdmin.success) {
            console.log('Default admin created: username=admin, password=admin123');
            // Retry login with created admin
            if (username === 'admin' && password === 'admin123') {
              const newResult = await executeQuery(query, [username]);
              if (newResult.success && newResult.data.length > 0) {
                console.log('Using newly created admin account');
                const admin = newResult.data[0];
                const isValidPassword = await bcrypt.compare(password, admin.password);
                if (isValidPassword) {
                  // Update last login
                  await executeQuery('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);
                  
                  // Generate JWT token
                  const token = jwt.sign(
                    { 
                      id: admin.id, 
                      username: admin.username,
                      email: admin.email 
                    },
                    process.env.JWT_SECRET || 'default_secret_key',
                    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
                  );

                  return res.json({
                    success: true,
                    message: 'Login successful (default admin created)',
                    data: {
                      token,
                      admin: {
                        id: admin.id,
                        username: admin.username,
                        email: admin.email
                      }
                    }
                  });
                }
              }
            }
          }
        }
      }
      
      console.log(`Login failed: No admin found with username '${username}'`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const admin = result.data[0];
    console.log(`Found admin: ${admin.username}, checking password...`);

    // Check password
    let isValidPassword = false;
    
    // Check if password is hashed
    if (admin.password.startsWith('$2y$') || admin.password.startsWith('$2b$') || admin.password.startsWith('$2a$')) {
      try {
        // Convert $2y$ (PHP) to $2b$ (Node.js) for compatibility
        let nodePassword = admin.password;
        if (admin.password.startsWith('$2y$')) {
          nodePassword = admin.password.replace('$2y$', '$2b$');
          console.log('Converting PHP bcrypt hash to Node.js format');
        }
        
        isValidPassword = await bcrypt.compare(password, nodePassword);
        console.log(`Bcrypt comparison result: ${isValidPassword}`);
        
        // If conversion didn't work, try original password
        if (!isValidPassword && admin.password.startsWith('$2y$')) {
          console.log('Trying original PHP hash format...');
          isValidPassword = await bcrypt.compare(password, admin.password);
          console.log(`Original hash comparison result: ${isValidPassword}`);
        }
      } catch (bcryptError) {
        console.log('Bcrypt comparison failed:', bcryptError.message);
        isValidPassword = false;
      }
    } else {
      // Plain text comparison (for development/demo)
      console.log('Using plain text comparison...');
      isValidPassword = (password === admin.password);
      console.log(`Plain text comparison result: ${isValidPassword}`);
    }

    if (!isValidPassword) {
      console.log(`Login failed: Invalid password for user '${username}'`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log(`Login successful for user: ${username}`);

    // Update last login
    await executeQuery('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: admin.id, 
        username: admin.username,
        email: admin.email 
      },
      process.env.JWT_SECRET || 'default_secret_key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Admin logout (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @route   GET /api/auth/me
// @desc    Get current admin info
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const query = 'SELECT id, username, email, created_at, last_login FROM admins WHERE id = ?';
    const result = await executeQuery(query, [req.user.id]);

    if (!result.success || result.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: result.data[0]
    });

  } catch (error) {
    console.error('Get admin info error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change admin password
// @access  Private
router.post('/change-password', [
  authenticateToken,
  body('currentPassword').isLength({ min: 6 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current admin
    const query = 'SELECT password FROM admins WHERE id = ?';
    const result = await executeQuery(query, [req.user.id]);

    if (!result.success || result.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const admin = result.data[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);

    // Update password
    const updateResult = await executeQuery(
      'UPDATE admins SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update password'
      });
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
