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

import DashboardAdmin from './components/DashboardAdmin'


// DashboardAdmin đã hoàn chỉnh, thay thế Dashboard cũ

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
                  <DashboardAdmin />
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
