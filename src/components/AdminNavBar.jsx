import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Button, Space } from 'antd'
import { KeyOutlined, DashboardOutlined, PlusCircleOutlined, UserOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons'

const adminNavs = [
  { to: '/', label: 'Xác thực key', icon: <KeyOutlined /> },
  { to: '/dashboard', label: 'Bảng điều khiển', icon: <DashboardOutlined /> },
  { to: '/create-key', label: 'Tạo key', icon: <PlusCircleOutlined /> },
  { to: '/account', label: 'Tài khoản', icon: <UserOutlined /> },
  { to: '/settings', label: 'Cài đặt', icon: <SettingOutlined /> },
]

const AdminNavBar = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const adminUsername = localStorage.getItem('adminUsername') || 'Admin'

  const handleLogout = () => {
    localStorage.removeItem('isAdmin')
    localStorage.removeItem('adminUsername')
    navigate('/')
    window.location.reload() // Reload để reset state
  }

  const items = adminNavs.map(n => ({
    key: n.to,
    icon: n.icon,
    label: <Link to={n.to}>{n.label}</Link>,
  }))

  return (
    <nav className="bg-white shadow-sm border-b mb-4">
      <div className="flex justify-between items-center px-4">
        <Menu
          mode="horizontal"
          selectedKeys={[pathname === '/' ? '/' : pathname]}
          className="flex-1"
          style={{ border: 'none', fontSize: 16 }}
          items={items}
        />
        
        <Space className="text-sm">
          <span className="text-gray-600">Xin chào, <strong className="text-blue-600">{adminUsername}</strong></span>
          <Button 
            type="text" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
            className="text-red-500 hover:text-red-700"
          >
            Đăng xuất
          </Button>
        </Space>
      </div>
    </nav>
  )
}

export default AdminNavBar
