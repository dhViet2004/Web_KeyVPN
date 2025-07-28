-- KeyVPN Database Schema
-- Tạo database
CREATE DATABASE IF NOT EXISTS keyvpn_db;
USE keyvpn_db;

-- Bảng admin users
CREATE TABLE admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Bảng key groups (FBX, THX, CTV, TEST)
CREATE TABLE key_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng VPN keys
CREATE TABLE vpn_keys (
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
    FOREIGN KEY (group_id) REFERENCES key_groups(id),
    FOREIGN KEY (created_by) REFERENCES admins(id),
    INDEX idx_code (code),
    INDEX idx_status (status),
    INDEX idx_group (group_id),
    INDEX idx_expires (expires_at)
);

-- Bảng VPN accounts
CREATE TABLE vpn_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    key_id INT,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_used TIMESTAMP NULL,
    usage_count INT DEFAULT 0,
    FOREIGN KEY (key_id) REFERENCES vpn_keys(id),
    FOREIGN KEY (created_by) REFERENCES admins(id),
    INDEX idx_username (username),
    INDEX idx_expires (expires_at),
    INDEX idx_key (key_id)
);

-- Bảng account_keys (quan hệ nhiều-nhiều giữa accounts và keys)
CREATE TABLE account_keys (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    key_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_by INT,
    FOREIGN KEY (account_id) REFERENCES vpn_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (key_id) REFERENCES vpn_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES admins(id),
    INDEX idx_account_id (account_id),
    INDEX idx_key_id (key_id),
    INDEX idx_assigned_at (assigned_at),
    UNIQUE KEY unique_account_key (account_id, key_id)
);

-- Bảng key usage history
CREATE TABLE key_usage_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    key_id INT NOT NULL,
    account_id INT,
    action ENUM('created', 'activated', 'reset', 'expired', 'deleted') NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES vpn_keys(id),
    FOREIGN KEY (account_id) REFERENCES vpn_accounts(id),
    INDEX idx_key (key_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
);

-- Bảng gift codes
CREATE TABLE gift_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    bonus_days INT NOT NULL DEFAULT 0,
    max_uses INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES admins(id),
    INDEX idx_code (code),
    INDEX idx_active (is_active)
);

-- Bảng gift code usage
CREATE TABLE gift_usage_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    gift_code_id INT NOT NULL,
    key_id INT,
    ip_address VARCHAR(45),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bonus_applied INT DEFAULT 0,
    FOREIGN KEY (gift_code_id) REFERENCES gift_codes(id),
    FOREIGN KEY (key_id) REFERENCES vpn_keys(id),
    INDEX idx_gift (gift_code_id),
    INDEX idx_key (key_id)
);

-- Bảng system settings
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES admins(id),
    INDEX idx_key (setting_key)
);

-- Bảng notifications
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
    target_audience ENUM('all', 'users', 'admins') DEFAULT 'all',
    is_active BOOLEAN DEFAULT TRUE,
    display_count INT DEFAULT 1,
    has_link BOOLEAN DEFAULT FALSE,
    link_url VARCHAR(500),
    link_text VARCHAR(100),
    position ENUM('before', 'after') DEFAULT 'before',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (created_by) REFERENCES admins(id),
    INDEX idx_active (is_active),
    INDEX idx_target (target_audience)
);

-- Bảng user sessions (để track người dùng)
CREATE TABLE user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    key_checked VARCHAR(50),
    is_admin BOOLEAN DEFAULT FALSE,
    admin_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id),
    INDEX idx_session (session_id),
    INDEX idx_ip (ip_address),
    INDEX idx_activity (last_activity)
);

-- Bảng statistics (để lưu thống kê)
CREATE TABLE statistics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stat_date DATE NOT NULL,
    keys_created INT DEFAULT 0,
    keys_used INT DEFAULT 0,
    accounts_created INT DEFAULT 0,
    accounts_expired INT DEFAULT 0,
    gift_codes_used INT DEFAULT 0,
    unique_visitors INT DEFAULT 0,
    admin_logins INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_date (stat_date),
    INDEX idx_date (stat_date)
);

-- Insert dữ liệu mẫu

-- Insert key groups
INSERT INTO key_groups (code, name, description) VALUES
('FBX', 'FBX Group', 'FBX VPN Keys'),
('THX', 'THX Group', 'THX VPN Keys'), 
('CTV', 'CTV Group', 'CTV VPN Keys'),
('TEST', 'TEST Group', 'Test VPN Keys');

-- Insert sample VPN keys
INSERT INTO vpn_keys (code, group_id, status, days_valid, key_type) VALUES
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
('TEST002', 4, 'chờ', 7, '1key');

-- Insert admin user mặc định
INSERT INTO admins (username, password, email) VALUES 
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@keyvpn.com');
-- Password: admin123 (nên hash bằng bcrypt)

-- Trigger để giới hạn tối đa 3 key per account
DELIMITER //
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
END//
DELIMITER ;

