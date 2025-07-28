const bcrypt = require('bcryptjs');
const { executeQuery, testConnection } = require('./config/database');
require('dotenv').config();

const resetAdminAccount = async () => {
  console.log('🔧 Resetting admin account...');
  
  try {
    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Cannot connect to database');
      process.exit(1);
    }

    // Backup existing admins (optional)
    console.log('📋 Backing up existing admin accounts...');
    const backupResult = await executeQuery('SELECT * FROM admins');
    if (backupResult.success && backupResult.data.length > 0) {
      console.log('Existing admins:', backupResult.data.map(a => ({
        id: a.id,
        username: a.username,
        email: a.email,
        is_active: a.is_active
      })));
    }

    // Delete all existing admins
    console.log('🗑️ Deleting existing admin accounts...');
    const deleteResult = await executeQuery('DELETE FROM admins');
    if (!deleteResult.success) {
      throw new Error('Failed to delete existing admins: ' + deleteResult.error);
    }
    console.log('✅ Deleted existing admin accounts');

    // Reset AUTO_INCREMENT
    const resetResult = await executeQuery('ALTER TABLE admins AUTO_INCREMENT = 1');
    if (!resetResult.success) {
      console.log('⚠️ Warning: Could not reset AUTO_INCREMENT');
    }

    // Create new admin account
    console.log('👤 Creating new admin account...');
    const newUsername = process.env.ADMIN_USERNAME || 'admin';
    const newPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const newEmail = process.env.ADMIN_EMAIL || 'admin@keyvpn.com';

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const insertResult = await executeQuery(`
      INSERT INTO admins (username, password, email, is_active, created_at) 
      VALUES (?, ?, ?, 1, NOW())
    `, [newUsername, hashedPassword, newEmail]);

    if (!insertResult.success) {
      throw new Error('Failed to create new admin: ' + insertResult.error);
    }

    console.log('✅ New admin account created successfully!');
    console.log(`   Username: ${newUsername}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`   Email: ${newEmail}`);

    // Verify the new admin
    const verifyResult = await executeQuery(
      'SELECT id, username, email, is_active, created_at FROM admins WHERE username = ?',
      [newUsername]
    );

    if (verifyResult.success && verifyResult.data.length > 0) {
      console.log('✅ Admin verification successful:');
      console.log(verifyResult.data[0]);
    } else {
      console.log('⚠️ Warning: Could not verify new admin account');
    }

    console.log('🎉 Admin account reset completed successfully!');

  } catch (error) {
    console.error('❌ Admin reset failed:', error.message);
    process.exit(1);
  }
};

// Add option to create multiple admins
const createMultipleAdmins = async () => {
  console.log('👥 Creating multiple admin accounts...');
  
  const admins = [
    { username: 'admin', password: 'admin123', email: 'admin@keyvpn.com' },
    { username: 'admin2', password: 'admin456', email: 'admin2@keyvpn.com' },
    { username: 'superadmin', password: 'super123', email: 'super@keyvpn.com' }
  ];

  try {
    for (const admin of admins) {
      const hashedPassword = await bcrypt.hash(admin.password, 12);
      
      const result = await executeQuery(`
        INSERT INTO admins (username, password, email, is_active, created_at) 
        VALUES (?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE 
        password = VALUES(password), 
        email = VALUES(email),
        updated_at = NOW()
      `, [admin.username, hashedPassword, admin.email]);

      if (result.success) {
        console.log(`✅ Admin '${admin.username}' created/updated`);
      } else {
        console.log(`❌ Failed to create admin '${admin.username}':`, result.error);
      }
    }
  } catch (error) {
    console.error('❌ Error creating multiple admins:', error.message);
  }
};

// Command line interface
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'reset':
    resetAdminAccount();
    break;
  case 'multiple':
    createMultipleAdmins();
    break;
  default:
    console.log('📖 Usage:');
    console.log('  node reset-admin.js reset     - Reset admin account');
    console.log('  node reset-admin.js multiple  - Create multiple admin accounts');
    break;
}

module.exports = { resetAdminAccount, createMultipleAdmins };
