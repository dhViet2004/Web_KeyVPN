const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'sapassword',
  port: process.env.DB_PORT || 3307,
  charset: 'utf8mb4'
};

async function initDatabase() {
  let connection;
  try {
    // Connect without database first
    connection = await mysql.createConnection(dbConfig);
    
    console.log('🔌 Connected to MySQL server');

    // Create database if not exists
    await connection.execute('CREATE DATABASE IF NOT EXISTS keyvpn_db');
    console.log('✅ Database created/verified');

    // Switch to the database
    await connection.query('USE keyvpn_db');

    // Create tables
    console.log('📝 Creating tables...');

    // Key groups table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS key_groups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Admins table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // VPN keys table
    await connection.execute(`
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
        FOREIGN KEY (group_id) REFERENCES key_groups(id)
      )
    `);

    // VPN accounts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS vpn_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        key_id INT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_used TIMESTAMP NULL,
        usage_count INT DEFAULT 0,
        FOREIGN KEY (key_id) REFERENCES vpn_keys(id)
      )
    `);

    console.log('✅ Tables created successfully');

    // Insert sample data
    console.log('📊 Inserting sample data...');

    // Insert key groups
    await connection.execute(`
      INSERT IGNORE INTO key_groups (code, name, description) VALUES
      ('FBX', 'Facebook VPN', 'Key cho Facebook VPN'),
      ('THX', 'TikTok VPN', 'Key cho TikTok VPN'),
      ('CTV', 'Cộng tác viên', 'Key cho cộng tác viên'),
      ('TEST', 'Test Keys', 'Key dùng để test')
    `);

    // Insert default admin
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await connection.execute(`
      INSERT IGNORE INTO admins (username, password, email) VALUES
      ('admin', ?, 'admin@keyvpn.com')
    `, [hashedPassword]);

    // Insert sample accounts
    const now = new Date();
    const accounts = [
      { username: 'vpnuser1', password: 'xincamon', expires_at: new Date(now.getTime() + 72 * 60 * 60 * 1000) },
      { username: 'vpnuser2', password: 'xincamon', expires_at: new Date(now.getTime() + 62 * 60 * 60 * 1000) },
      { username: 'vpnuser3', password: 'xincamon', expires_at: new Date(now.getTime() + 52 * 60 * 60 * 1000) },
      { username: 'vpnuser4', password: 'xincamon', expires_at: new Date(now.getTime() + 42 * 60 * 60 * 1000) },
      { username: 'vpnuser5', password: 'xincamon', expires_at: new Date(now.getTime() + 32 * 60 * 60 * 1000) },
      { username: 'vpnuser6', password: 'xincamon', expires_at: new Date(now.getTime() + 22 * 60 * 60 * 1000) },
      { username: 'vpnuser7', password: 'xincamon', expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000) },
      { username: 'vpnuser8', password: 'xincamon', expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000) }
    ];

    for (const account of accounts) {
      await connection.execute(`
        INSERT IGNORE INTO vpn_accounts (username, password, expires_at) VALUES (?, ?, ?)
      `, [account.username, account.password, account.expires_at]);
    }

    // Insert sample keys
    const keys = [
      { code: 'FBX001', status: 'chờ', days_valid: 30, key_type: '2key', group_id: 1 },
      { code: 'FBX002', status: 'đang hoạt động', days_valid: 30, key_type: '2key', group_id: 1 },
      { code: 'THX001', status: 'chờ', days_valid: 30, key_type: '1key', group_id: 2 },
      { code: 'THX002', status: 'hết hạn', days_valid: 15, key_type: '2key', group_id: 2 },
      { code: 'CTV001', status: 'chờ', days_valid: 60, key_type: '3key', group_id: 3 },
      { code: 'TEST001', status: 'đang hoạt động', days_valid: 7, key_type: '1key', group_id: 4 }
    ];

    for (const key of keys) {
      await connection.execute(`
        INSERT IGNORE INTO vpn_keys (code, status, days_valid, key_type, group_id) VALUES (?, ?, ?, ?, ?)
      `, [key.code, key.status, key.days_valid, key.key_type, key.group_id]);
    }

    console.log('✅ Sample data inserted successfully');
    console.log('🎉 Database initialization completed!');
    console.log('\n📋 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n🔗 Server will run on: http://localhost:5001');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();
