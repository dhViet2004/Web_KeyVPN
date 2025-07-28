const { executeQuery } = require('../config/database');
const bcrypt = require('bcryptjs');

async function createAdminTable() {
  console.log('🔍 Checking admins table...');
  
  try {
    // Check if admins table exists
    const tableCheck = await executeQuery('SHOW TABLES LIKE "admins"');
    
    if (!tableCheck.success || tableCheck.data.length === 0) {
      console.log('❌ admins table does not exist');
      console.log('Creating admins table...');
      
      const createResult = await executeQuery(`
        CREATE TABLE IF NOT EXISTS admins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(100),
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_login TIMESTAMP NULL,
          INDEX idx_username (username),
          INDEX idx_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      if (createResult.success) {
        console.log('✅ admins table created successfully');
      } else {
        console.log('❌ Failed to create admins table:', createResult.error);
        return;
      }
    } else {
      console.log('✅ admins table exists');
    }

    // Check if there are any admin accounts
    const adminCheck = await executeQuery('SELECT COUNT(*) as count FROM admins');
    
    if (adminCheck.success && adminCheck.data[0].count === 0) {
      console.log('❌ No admin accounts found');
      console.log('Creating default admin account...');
      
      // Create default admin with hashed password
      const hashedPassword = await bcrypt.hash('admin123', 12);
      const insertResult = await executeQuery(
        'INSERT INTO admins (username, password, email, is_active) VALUES (?, ?, ?, ?)',
        ['admin', hashedPassword, 'admin@keyvpn.com', 1]
      );
      
      if (insertResult.success) {
        console.log('✅ Default admin created successfully');
        console.log('📋 Login credentials:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   Email: admin@keyvpn.com');
      } else {
        console.log('❌ Failed to create default admin:', insertResult.error);
      }
    } else if (adminCheck.success) {
      console.log(`✅ Found ${adminCheck.data[0].count} admin account(s)`);
      
      // List existing admins
      const adminList = await executeQuery('SELECT id, username, email, is_active, created_at FROM admins');
      if (adminList.success) {
        console.log('📋 Existing admin accounts:');
        adminList.data.forEach(admin => {
          console.log(`   ID: ${admin.id}, Username: ${admin.username}, Email: ${admin.email}, Active: ${admin.is_active ? 'Yes' : 'No'}`);
        });
      }
    }
    
    console.log('✅ Admin table setup completed successfully');
    
  } catch (error) {
    console.error('❌ Admin table setup failed:', error);
  }
  
  process.exit(0);
}

// Run the setup
createAdminTable();
