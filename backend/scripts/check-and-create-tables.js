const { executeQuery } = require('../config/database');

async function checkAndCreateTables() {
  console.log('🔍 Checking database tables...');
  
  try {
    // Check and create key_groups table first
    console.log('Checking if key_groups table exists...');
    const keyGroupsResult = await executeQuery('SHOW TABLES LIKE "key_groups"');
    
    if (!keyGroupsResult.success || keyGroupsResult.data.length === 0) {
      console.log('❌ key_groups table does not exist');
      console.log('Creating key_groups table...');
      
      const createKeyGroupsResult = await executeQuery(`
        CREATE TABLE IF NOT EXISTS key_groups (
          id INT PRIMARY KEY AUTO_INCREMENT,
          code VARCHAR(10) UNIQUE NOT NULL,
          name VARCHAR(50) NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      if (createKeyGroupsResult.success) {
        console.log('✅ key_groups table created successfully');
        
        // Insert sample key groups
        await executeQuery(`
          INSERT IGNORE INTO key_groups (code, name, description) VALUES
          ('FBX', 'FBX Group', 'FBX VPN Keys'),
          ('THX', 'THX Group', 'THX VPN Keys'), 
          ('CTV', 'CTV Group', 'CTV VPN Keys'),
          ('TEST', 'TEST Group', 'Test VPN Keys')
        `);
        console.log('✅ Sample key groups inserted');
      } else {
        console.log('❌ Failed to create key_groups table:', createKeyGroupsResult.error);
      }
    } else {
      console.log('✅ key_groups table exists');
    }

    // Check and create vpn_keys table
    console.log('Checking if vpn_keys table exists...');
    const vpnKeysResult = await executeQuery('SHOW TABLES LIKE "vpn_keys"');
    
    if (!vpnKeysResult.success || vpnKeysResult.data.length === 0) {
      console.log('❌ vpn_keys table does not exist');
      console.log('Creating vpn_keys table...');
      
      const createVpnKeysResult = await executeQuery(`
        CREATE TABLE IF NOT EXISTS vpn_keys (
          id INT PRIMARY KEY AUTO_INCREMENT,
          code VARCHAR(50) UNIQUE NOT NULL,
          group_id INT NOT NULL,
          status ENUM('chờ', 'đang hoạt động', 'hết hạn') DEFAULT 'chờ',
          days_valid INT NOT NULL DEFAULT 30,
          key_type ENUM('1key', '2key', '3key') DEFAULT '2key',
          account_count INT DEFAULT 1,
          customer_name VARCHAR(100),
          customer_info TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL,
          is_active BOOLEAN DEFAULT TRUE,
          FOREIGN KEY (group_id) REFERENCES key_groups(id),
          INDEX idx_code (code),
          INDEX idx_status (status),
          INDEX idx_group (group_id),
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      if (createVpnKeysResult.success) {
        console.log('✅ vpn_keys table created successfully');
        
        // Insert sample VPN keys
        await executeQuery(`
          INSERT IGNORE INTO vpn_keys (code, group_id, status, days_valid, key_type) VALUES
          ('FBX001', 1, 'chờ', 30, '2key'),
          ('FBX002', 1, 'chờ', 30, '2key'),
          ('FBX003', 1, 'chờ', 30, '2key'),
          ('THX001', 2, 'chờ', 30, '2key'),
          ('THX002', 2, 'chờ', 30, '2key'),
          ('THX003', 2, 'chờ', 30, '2key'),
          ('CTV001', 3, 'chờ', 30, '2key'),
          ('CTV002', 3, 'chờ', 30, '2key'),
          ('CTV003', 3, 'chờ', 30, '2key'),
          ('TEST001', 4, 'chờ', 7, '1key'),
          ('TEST002', 4, 'chờ', 7, '1key')
        `);
        console.log('✅ Sample VPN keys inserted');
      } else {
        console.log('❌ Failed to create vpn_keys table:', createVpnKeysResult.error);
      }
    } else {
      console.log('✅ vpn_keys table exists');
    }

    // Check if account_keys table exists
    console.log('Checking if account_keys table exists...');
    const result = await executeQuery('SHOW TABLES LIKE "account_keys"');
    
    if (result.success && result.data.length > 0) {
      console.log('✅ account_keys table exists');
    } else {
      console.log('❌ account_keys table does not exist');
      console.log('Creating account_keys table...');
      
      const createResult = await executeQuery(`
        CREATE TABLE IF NOT EXISTS account_keys (
          id INT PRIMARY KEY AUTO_INCREMENT,
          account_id INT NOT NULL,
          key_id INT NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE,
          assigned_by INT,
          FOREIGN KEY (account_id) REFERENCES vpn_accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (key_id) REFERENCES vpn_keys(id) ON DELETE CASCADE,
          INDEX idx_account_id (account_id),
          INDEX idx_key_id (key_id),
          INDEX idx_assigned_at (assigned_at),
          UNIQUE KEY unique_account_key (account_id, key_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      if (createResult.success) {
        console.log('✅ account_keys table created successfully');
      } else {
        console.log('❌ Failed to create account_keys table:', createResult.error);
      }
    }
    
    // Check vpn_accounts table structure
    console.log('Checking vpn_accounts table structure...');
    const tableResult = await executeQuery('DESCRIBE vpn_accounts');
    if (tableResult.success) {
      console.log('✅ vpn_accounts table exists with columns:', tableResult.data.map(col => col.Field).join(', '));
    } else {
      console.log('❌ Failed to check vpn_accounts table:', tableResult.error);
    }

    // Create trigger for maximum 3 keys per account
    console.log('Creating trigger for key limit...');
    try {
      await executeQuery('DROP TRIGGER IF EXISTS check_max_keys_per_account');
      await executeQuery(`
        CREATE TRIGGER check_max_keys_per_account 
        BEFORE INSERT ON account_keys
        FOR EACH ROW
        BEGIN
            DECLARE key_count INT;
            
            SELECT COUNT(*) INTO key_count 
            FROM account_keys 
            WHERE account_id = NEW.account_id AND is_active = 1;
            
            IF key_count >= 3 THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Account cannot have more than 3 active keys';
            END IF;
        END
      `);
      console.log('✅ Trigger created successfully');
    } catch (triggerError) {
      console.log('⚠️ Trigger creation failed (may already exist):', triggerError.message);
    }
    
    console.log('✅ Database setup completed successfully');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
  }
  
  process.exit(0);
}

// Check if this script is being run directly
if (require.main === module) {
  checkAndCreateTables().catch(console.error);
}

module.exports = { checkAndCreateTables };
