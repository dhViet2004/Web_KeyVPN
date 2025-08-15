import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { App as AntApp } from 'antd'
import './App.css'
import Header from './components/Header'
import NavBar from './components/NavBar'
import AuthKey from './components/AuthKey'
import CreateKey from './components/CreateKey'
import Account from './components/Account'
import Settings from './components/Settings'
import AdminLogin from './components/AdminLogin'
import { SettingsProvider } from './contexts/SettingsContext'
import DashboardAdmin from './components/DashboardAdmin'

// Component bảo vệ route admin
function ProtectedRoute({ children }) {
  const isAdmin = localStorage.getItem('isAdmin') === 'true'
  // Nếu không phải admin, chỉ chuyển hướng khi đang ở các route admin
  return isAdmin ? children : <Navigate to="/admin-login" replace />
}

// Trang chủ user mặc định
function HomePage() {
  return <AuthKey />
}

// Admin login page
function AdminLoginPage() {
  const navigate = useNavigate()

  // Giả sử bạn có hàm login admin, sau khi login:
  const handleLoginSuccess = () => {
    localStorage.setItem('isAdmin', 'true')
    navigate('/dashboard', { replace: true })
  }

  return <AdminLogin onLoginSuccess={handleLoginSuccess} />
}

function App() {
  useEffect(() => {
    // Lắng nghe thay đổi trong localStorage để update NavBar
    const handleStorageChange = () => {
      window.dispatchEvent(new Event('admin-status-changed'))
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <AntApp>
      <SettingsProvider>
        <Router>
          <Header />
          <NavBar />
          <Routes>
            {/* Trang chủ luôn là AuthKey, không bảo vệ */}
            <Route path="/" element={<HomePage />} />
            <Route path="/admin-login" element={<AdminLoginPage />} />
            {/* Các route admin mới dùng ProtectedRoute */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardAdmin /></ProtectedRoute>} />
            <Route path="/create-key" element={<ProtectedRoute><CreateKey /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
        </Router>
      </SettingsProvider>
    </AntApp>
  )
}

export default App
