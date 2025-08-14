const { executeQuery } = require('../config/database');
const bcrypt = require('bcryptjs');

async function resetAdminPassword() {
  console.log('🔐 Resetting admin password...');
  
  try {
    // Check current admin
    const checkResult = await executeQuery('SELECT id, username, password FROM admins WHERE username = ?', ['admin']);
    
    if (!checkResult.success || checkResult.data.length === 0) {
      console.log('❌ Admin user not found');
      return;
    }
    
    const admin = checkResult.data[0];
    console.log('Current admin:', admin.username);
    console.log('Current password hash:', admin.password);
    
    // Create new hash for admin123
    const newPassword = 'Caphesua@123';
    console.log('Creating new hash for password:', newPassword);
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    console.log('New password hash:', hashedPassword);
    
    // Update password in database
    const updateResult = await executeQuery(
      'UPDATE admins SET password = ?, updated_at = NOW() WHERE username = ?',
      [hashedPassword, 'admin']
    );
    
    if (updateResult.success) {
      console.log('✅ Admin password updated successfully');
      console.log('📋 Login credentials:');
      console.log('   Username: admin');
      console.log('   Password: Caphesua@123');
      
      // Test the new hash
      const testResult = await bcrypt.compare(newPassword, hashedPassword);
      console.log('🧪 Hash test result:', testResult ? '✅ PASS' : '❌ FAIL');
    } else {
      console.log('❌ Failed to update password:', updateResult.error);
    }
    
  } catch (error) {
    console.error('❌ Reset password failed:', error);
  }
  
  process.exit(0);
}

resetAdminPassword();
