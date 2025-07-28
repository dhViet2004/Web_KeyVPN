const bcrypt = require('bcryptjs');
const { executeQuery, testConnection } = require('./config/database');
require('dotenv').config();

const initializeDatabase = async () => {
  console.log('🔧 Initializing database...');
  
  try {
    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Cannot connect to database');
      process.exit(1);
    }

    // Check if admins table exists and has data
    const checkAdminQuery = 'SELECT COUNT(*) as count FROM admins';
    const adminResult = await executeQuery(checkAdminQuery);
    
    if (!adminResult.success) {
      console.error('❌ Cannot access admins table:', adminResult.error);
      console.log('📝 Please run the database schema first:');
      console.log('   mysql -u root -p < database/keyvpn_schema.sql');
      process.exit(1);
    }

    const adminCount = adminResult.data[0].count;
    console.log(`📊 Found ${adminCount} admin(s) in database`);

    // If no admin users, create default admin
    if (adminCount === 0) {
      console.log('👤 Creating default admin user...');
      
      const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      const insertAdminQuery = `
        INSERT INTO admins (username, password, email, is_active) 
        VALUES (?, ?, ?, 1)
      `;
      
      const result = await executeQuery(insertAdminQuery, [
        defaultUsername,
        hashedPassword,
        'admin@keyvpn.com'
      ]);

      if (result.success) {
        console.log('✅ Default admin created successfully');
        console.log(`   Username: ${defaultUsername}`);
        console.log(`   Password: ${defaultPassword}`);
      } else {
        console.error('❌ Failed to create admin:', result.error);
      }
    }

    // Check key_groups table
    const checkGroupsQuery = 'SELECT COUNT(*) as count FROM key_groups';
    const groupsResult = await executeQuery(checkGroupsQuery);
    
    if (groupsResult.success) {
      const groupCount = groupsResult.data[0].count;
      console.log(`📊 Found ${groupCount} key group(s) in database`);
      
      if (groupCount === 0) {
        console.log('🔑 Creating default key groups...');
        
        const groups = [
          ['FBX', 'FBX Group', 'FBX VPN Keys'],
          ['THX', 'THX Group', 'THX VPN Keys'],
          ['CTV', 'CTV Group', 'CTV VPN Keys'],
          ['TEST', 'TEST Group', 'Test VPN Keys']
        ];

        for (const [code, name, description] of groups) {
          await executeQuery(
            'INSERT INTO key_groups (code, name, description, is_active) VALUES (?, ?, ?, 1)',
            [code, name, description]
          );
        }
        
        console.log('✅ Default key groups created');
      }
    }

    // Check system_settings table
    const checkSettingsQuery = 'SELECT COUNT(*) as count FROM system_settings';
    const settingsResult = await executeQuery(checkSettingsQuery);
    
    if (settingsResult.success) {
      const settingsCount = settingsResult.data[0].count;
      console.log(`📊 Found ${settingsCount} system setting(s) in database`);
      
      if (settingsCount === 0) {
        console.log('⚙️ Creating default system settings...');
        
        const settings = [
          ['notification_enabled', 'true', 'boolean', 'Bật/tắt thông báo hệ thống'],
          ['notification_title', 'THÔNG BÁO HỆ THỐNG', 'string', 'Tiêu đề thông báo'],
          ['notification_content', 'Chào mừng bạn đến với KeyVPN Tool!', 'string', 'Nội dung thông báo'],
          ['key_export_link_template', 'link nhập key:', 'string', 'Template link xuất key']
        ];

        for (const [key, value, type, description] of settings) {
          await executeQuery(
            'INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
            [key, value, type, description]
          );
        }
        
        console.log('✅ Default system settings created');
      }
    }

    console.log('🎉 Database initialization completed successfully!');
    console.log('🚀 You can now start the server with: npm start');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// Run initialization
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
