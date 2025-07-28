import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { App as AntApp, Spin, Alert } from 'antd'
import './App.css'
import Header from './components/Header'
import NavBar from './components/NavBar'
import AuthKey from './components/AuthKey'
import CreateKey from './components/CreateKey'
import Account from './components/Account'
import Settings from './components/Settings'
import AdminLogin from './components/AdminLogin'
import { SettingsProvider } from './contexts/SettingsContext'
import { useDashboard } from './hooks/useDashboard'

function Dashboard() {
  const { data, loading, error, refetch } = useDashboard()

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6">
        <div className="flex justify-center items-center h-40">
          <Spin size="large" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6">
        <Alert
          message="Lỗi tải dữ liệu"
          description={error}
          type="error"
          action={
            <button 
              onClick={refetch}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Thử lại
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6">
      <h2 className="text-2xl font-bold mb-4">Dashboard Admin</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border">
          <h3 className="font-semibold text-blue-700">Tổng Key được tạo</h3>
          <p className="text-2xl font-bold text-blue-600">{data.totalKeys.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border">
          <h3 className="font-semibold text-green-700">Key đang hoạt động</h3>
          <p className="text-2xl font-bold text-green-600">{data.activeKeys.toLocaleString()}</p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border">
          <h3 className="font-semibold text-orange-700">Tài khoản VPN</h3>
          <p className="text-2xl font-bold text-orange-600">{data.totalAccounts.toLocaleString()}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border">
          <h3 className="font-semibold text-yellow-700">Key chờ kích hoạt</h3>
          <p className="text-2xl font-bold text-yellow-600">{data.pendingKeys.toLocaleString()}</p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border">
          <h3 className="font-semibold text-red-700">Key đã hết hạn</h3>
          <p className="text-2xl font-bold text-red-600">{data.expiredKeys.toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}

// Component kiểm tra và chuyển hướng trang chủ
function HomePage() {
  const isAdmin = localStorage.getItem('isAdmin') === 'true'
  
  if (isAdmin) {
    return <Navigate to="/dashboard" replace />
  }
  
  return <AuthKey />
}

// Component bảo vệ route admin
function ProtectedRoute({ children }) {
  const isAdmin = localStorage.getItem('isAdmin') === 'true'
  return isAdmin ? children : <Navigate to="/admin-login" replace />
}

function App() {
  useEffect(() => {
    // Lắng nghe thay đổi trong localStorage để update NavBar
    const handleStorageChange = () => {
      // Force re-render NavBar khi admin status thay đổi
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
            <Route path="/" element={<HomePage />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/create-key" 
              element={
                <ProtectedRoute>
                  <CreateKey />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/account" 
              element={
                <ProtectedRoute>
                  <Account />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </Router>
      </SettingsProvider>
    </AntApp>
  )
}

export default App
