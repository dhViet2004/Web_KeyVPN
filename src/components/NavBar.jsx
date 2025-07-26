import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Button, Space } from 'antd'
import { KeyOutlined, LoginOutlined, DashboardOutlined, PlusCircleOutlined, UserOutlined, SettingOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'

const NavBar = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')

  useEffect(() => {
    const adminStatus = localStorage.getItem('isAdmin') === 'true'
    const username = localStorage.getItem('adminUsername') || 'Admin'
    setIsAdmin(adminStatus)
    setAdminUsername(username)
  }, [pathname]) // Re-check khi pathname thay đổi

  const handleLogout = () => {
    localStorage.removeItem('isAdmin')
    localStorage.removeItem('adminUsername')
    setIsAdmin(false)
    navigate('/')
    window.location.reload()
  }

  // Navigation items cho user thường
  const userNavs = [
    { to: '/', label: 'Xác thực key', icon: <KeyOutlined /> },
    { to: '/admin-login', label: 'Đăng nhập Admin', icon: <LoginOutlined /> },
  ]

  // Navigation items cho admin
  const adminNavs = [
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
    { to: '/create-key', label: 'Tạo key', icon: <PlusCircleOutlined /> },
    { to: '/account', label: 'Tài khoản', icon: <UserOutlined /> },
    { to: '/settings', label: 'Cài đặt', icon: <SettingOutlined /> },
  ]

  const navs = isAdmin ? adminNavs : userNavs
  const items = navs.map(n => ({
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
          overflowedIndicator={<MenuOutlined />}
        />
        
        {isAdmin && (
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
        )}
      </div>
    </nav>
  )
}

export default NavBar 