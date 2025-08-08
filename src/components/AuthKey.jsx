import { useState, useEffect } from 'react'
import { FaKey, FaGift, FaRegClock, FaCheckCircle, FaExclamationTriangle, FaTimesCircle, FaUserPlus } from 'react-icons/fa'
import NotificationModal from './NotificationModal'
import { useSettings } from '../hooks/useSettings'
import { publicAPI, utils } from '../services/api'

const getStatusColor = (days, error) => {
  if (error) return 'bg-red-50 text-red-700 border-red-300'
  if (days > 5) return 'bg-green-50 text-green-700 border-green-300'
  if (days > 0) return 'bg-yellow-50 text-yellow-700 border-yellow-300'
  return 'bg-red-50 text-red-700 border-red-300'
}
const getStatusIcon = (days, error) => {
  if (error) return <FaTimesCircle className="inline mr-2 text-red-400" size={20} />
  if (days > 5) return <FaCheckCircle className="inline mr-2 text-green-400" size={20} />
  if (days > 0) return <FaExclamationTriangle className="inline mr-2 text-yellow-400" size={20} />
  return <FaTimesCircle className="inline mr-2 text-red-400" size={20} />
}

const AuthKey = () => {
  const [key, setKey] = useState('')
  const [gift, setGift] = useState('')
  const [days, setDays] = useState(null) // null: chưa xác thực, số: ngày còn lại
  const [error, setError] = useState(false)
  const [showNotification, setShowNotification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [_keyInfo, setKeyInfo] = useState(null)
  const [assigningKey, setAssigningKey] = useState(false) // Trạng thái đang gán key
  const [assignmentMessage, setAssignmentMessage] = useState('') // Thông báo về việc gán key
  const [lastCheckedKey, setLastCheckedKey] = useState('') // Key đã kiểm tra lần trước
  const { settings } = useSettings()

  // Hiển thị notification mỗi khi load trang
  useEffect(() => {
    const timer = setTimeout(() => {
      // Luôn hiển thị notification nếu được bật trong settings
      if (settings?.notification?.enabled) {
        setShowNotification(true)
      }
    }, 1000) // Delay để đảm bảo settings được load
    
    return () => clearTimeout(timer)
  }, [settings]) // Dependency là settings object

  // Xác thực key với API
  // Hàm tự động gán key vào tài khoản VPN có sẵn
  const autoAssignKey = async (keyCode) => {
    try {
      setAssigningKey(true)

      const response = await publicAPI.autoAssignKey(keyCode)

      if (response.success) {
        return true
      } else {
        // Kiểm tra nếu key đã được gán trước đó
        if (response.message && (response.message.includes('đã được gán') || response.message.includes('already assigned'))) {
          setAssignmentMessage(`ℹ️ Key này đã được gán trước đó. Đang cập nhật thông tin...`)
          
          // Refresh key info để lấy thông tin account
          try {
            const refreshResponse = await publicAPI.checkKey(keyCode)
            if (refreshResponse.success && refreshResponse.data && refreshResponse.data.accounts && refreshResponse.data.accounts.length > 0) {
              // Key đã có accounts sau khi refresh
              return true
            }
          } catch (refreshError) {
            console.error('Error refreshing key info:', refreshError)
          }
          
          setTimeout(() => setAssignmentMessage(''), 3000)
          return true // Vẫn trả về true vì key hợp lệ, chỉ là đã gán rồi
        } else {
          throw new Error(response.message || 'Không tìm thấy tài khoản VPN phù hợp')
        }
      }
    } catch (error) {
      setAssignmentMessage(`❌ Lỗi tìm kiếm/gán key: ${error.message}`)
      setTimeout(() => setAssignmentMessage(''), 8000)
      return false
    } finally {
      setAssigningKey(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!key.trim()) return
    
    setLoading(true)
    setAssignmentMessage('')
    
    try {
      const response = await publicAPI.checkKey(key.trim())
      
      if (response.success && response.data) {
        setError(false)
        setKeyInfo(response.data)
        setDays(response.data.days_remaining || 0)
        
        // Kiểm tra trạng thái key và accounts
        if (response.data.accounts && response.data.accounts.length > 0) {
          // Kiểm tra nếu user nhập lại cùng key
          const isRecheck = lastCheckedKey === key.trim() && _keyInfo && _keyInfo.accounts
          
          if (isRecheck) {
            // User nhập lại key để kiểm tra - hiển thị thông báo có mật khẩu
            const accountInfo = response.data.accounts[0]
            setAssignmentMessage(`🔑 Key đã được gán! Tài khoản: ${accountInfo.username} | Mật khẩu: ${accountInfo.password}`)
            setTimeout(() => setAssignmentMessage(''), 10000)
          } else {
            // Lần đầu nhập key - hiển thị thông báo có mật khẩu luôn
            const accountInfo = response.data.accounts[0]
            setAssignmentMessage(`🎉 Key hợp lệ và đã được gán! Tài khoản: ${accountInfo.username} | Mật khẩu: ${accountInfo.password}`)
            setTimeout(() => setAssignmentMessage(''), 10000)
          }
        } else {
          // Key chưa có accounts - tự động tìm và gán vào tài khoản phù hợp
          
          // Thử tự động gán key
          const autoAssigned = await autoAssignKey(key.trim())
          
          if (autoAssigned) {
            // Cập nhật lại thông tin key sau khi gán
            try {
              const updatedResponse = await publicAPI.checkKey(key.trim())
              if (updatedResponse.success) {
                setKeyInfo(updatedResponse.data)
                setDays(updatedResponse.data.days_remaining || 0)
              }
            } catch (updateError) {
              console.error('Error updating key info after assignment:', updateError)
            }
          } else {
            // Không thể tự động gán key
            setAssignmentMessage(`❌ Không tìm thấy tài khoản VPN trống phù hợp với loại ${response.data.key_type || 'key'}. Vui lòng liên hệ admin.`)
            setTimeout(() => setAssignmentMessage(''), 8000)
          }
        }
        
        // Lưu key đã kiểm tra
        setLastCheckedKey(key.trim())
      } else {
        setError(true)
        setDays(0)
        setKeyInfo(null)
      }
    } catch (error) {
      console.error('Key validation error:', error)
      setError(true)
      setDays(0)
      setKeyInfo(null)
    } finally {
      setLoading(false)
    }
  }

  // Sử dụng gift code
  const handleGiftSubmit = async (e) => {
    e.preventDefault()
    if (!gift.trim() || !key.trim()) return
    
    setLoading(true)
    try {
      const response = await publicAPI.useGiftCode(gift.trim(), key.trim())
      
      if (response.success) {
        // Refresh key info
        await handleSubmit(e)
        setGift('')
        alert(`Đã thêm ${response.data.bonusDays} ngày vào key của bạn!`)
      } else {
        alert(response.message || 'Gift code không hợp lệ!')
      }
    } catch (error) {
      console.error('Gift code error:', error)
      alert(utils.handleError(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6 transition-all">
      <div className="mb-4 text-base text-gray-800 text-center sm:text-left flex items-center gap-2">
        <FaKey className="text-blue-400" size={22} />
        Nhập key VPN của bạn vào ô bên dưới để xem thông tin tài khoản. Nếu key của bạn hợp lệ, bạn sẽ thấy thông tin đăng nhập tài khoản VPN mà bạn có thể sử dụng.
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-4">
        <div className="relative flex items-center">
          <FaKey className="absolute left-3 text-blue-300" size={18} />
          <input
            type="text"
            placeholder="Nhập key VPN..."
            className="border border-blue-100 bg-blue-50 p-2 pl-10 rounded-xl focus:outline-blue-400 w-full text-base shadow-sm transition-all"
            value={key}
            onChange={e => setKey(e.target.value)}
          />
        </div>
        <button 
          type="submit" 
          className="bg-blue-500 !text-white py-2 rounded-xl font-semibold hover:bg-blue-600 transition w-full text-base shadow disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Đang xác thực...' : 'Xác thực key'}
        </button>
      </form>
      
      {/* Hiển thị thông báo gán key tự động */}
      {assignmentMessage && (
        <div className="border-l-4 border-orange-400 bg-orange-50 p-3 mb-4 flex items-center gap-2 text-base rounded-xl shadow-sm">
          {assigningKey ? (
            <FaKey className="text-orange-500 animate-spin" size={18} />
          ) : (
            <FaUserPlus className="text-orange-500" size={18} />
          )}
          <span className="text-orange-700">{assignmentMessage}</span>
        </div>
      )}
      
      {days !== null && (
        <div className={`border-l-4 p-3 mb-4 flex items-center gap-2 ${getStatusColor(days, error)} text-base rounded-xl shadow-sm`}> 
          {getStatusIcon(days, error)}
          {error ? 'Key không hợp lệ hoặc đã hết hạn!' : days > 5 ? `Thời gian còn lại: ${days} ngày` : days > 0 ? `Thời gian còn lại: ${days} ngày (Sắp hết hạn!)` : 'Key đã hết hạn!'}
        </div>
      )}

      {/* Hiển thị thông tin tài khoản VPN nếu key đã được gán */}
      {_keyInfo && _keyInfo.accounts && _keyInfo.accounts.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-xl shadow-lg">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2 text-lg">
            <FaUserPlus className="text-blue-600" size={20} />
            🔐 Thông tin đăng nhập VPN
          </h3>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-blue-200">
            <div className="text-sm text-blue-700 mb-3 font-medium">
              ✅ Key của bạn đã được kích hoạt! Sử dụng thông tin dưới đây để đăng nhập VPN:
            </div>
            {_keyInfo.accounts.map((account, index) => (
              <div key={account.id || index} className="bg-white p-4 rounded-lg mb-3 last:mb-0 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold">
                    TÀI KHOẢN {index + 1}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                    <span className="text-gray-700 font-semibold">👤 Tên đăng nhập:</span>
                    <span className="font-mono font-bold text-blue-800 bg-blue-50 px-3 py-2 rounded border border-blue-200 text-center select-all">
                      {account.username}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                    <span className="text-gray-700 font-semibold">🔑 Mật khẩu:</span>
                    <span className="font-mono font-bold text-green-800 bg-green-50 px-3 py-2 rounded border border-green-200 text-center select-all">
                      {account.password}
                    </span>
                  </div>
                  {account.expires_at && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                      <span className="text-gray-700 font-semibold">⏰ Hết hạn:</span>
                      <span className="text-orange-700 font-semibold bg-orange-50 px-3 py-2 rounded border border-orange-200">
                        {new Date(account.expires_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                💡 <strong>Lưu ý:</strong> Sao chép thông tin đăng nhập và sử dụng trong ứng dụng VPN của bạn.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleGiftSubmit} className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 flex items-center">
          <FaGift className="absolute left-3 text-pink-300" size={18} />
          <input
            type="text"
            placeholder="Nhập gift code (nếu có)"
            className="border border-pink-100 bg-pink-50 p-2 pl-10 rounded-xl focus:outline-pink-400 text-base w-full shadow-sm transition-all"
            value={gift}
            onChange={e => setGift(e.target.value)}
          />
        </div>
        <button 
          type="submit" 
          className="bg-pink-500 !text-white px-4 py-2 rounded-xl font-semibold hover:bg-pink-600 transition w-full sm:w-auto text-base shadow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || !key.trim()}
        >
          <FaRegClock size={18}/>
          {loading ? 'Đang xử lý...' : 'Nhận thêm ngày'}
        </button>
      </form>
      <div className="font-bold text-red-500 uppercase text-xs sm:text-sm text-center sm:text-left bg-red-50 rounded-xl p-3 shadow-sm mt-2">
        Lưu ý: Khi tài khoản xback hết hạn hoặc còn 5 tiếng, các bạn quay lại trang này sử dụng lại key còn hiệu lực để nhận tài khoản xback mới nhé. Cảm ơn mọi người đã ủng hộ ^^
      </div>
      
      {/* Notification Modal */}
      <NotificationModal 
        show={showNotification} 
        onClose={() => setShowNotification(false)}
        position="before" 
      />
    </div>
  )
}

export default AuthKey 