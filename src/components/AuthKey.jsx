import { useState, useEffect } from 'react'
import { FaKey, FaGift, FaRegClock, FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa'
import NotificationModal from './NotificationModal'
import { useSettings } from '../hooks/useSettings'

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

  // Dummy handle submit
  const handleSubmit = e => {
    e.preventDefault()
    // Giả lập xác thực key
    if (key === 'error') {
      setError(true)
      setDays(0)
    } else if (key) {
      setError(false)
      setDays(Math.floor(Math.random() * 10))
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
        <button type="submit" className="bg-blue-500 !text-white py-2 rounded-xl font-semibold hover:bg-blue-600 transition w-full text-base shadow">Xác thực key</button>
      </form>
      {days !== null && (
        <div className={`border-l-4 p-3 mb-4 flex items-center gap-2 ${getStatusColor(days, error)} text-base rounded-xl shadow-sm`}> 
          {getStatusIcon(days, error)}
          {error ? 'Key không hợp lệ hoặc đã hết hạn!' : days > 5 ? `Thời gian còn lại: ${days} ngày` : days > 0 ? `Thời gian còn lại: ${days} ngày (Sắp hết hạn!)` : 'Key đã hết hạn!'}
        </div>
      )}
      <form className="flex flex-col sm:flex-row gap-2 mb-4">
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
        <button type="button" className="bg-pink-500 !text-white px-4 py-2 rounded-xl font-semibold hover:bg-pink-600 transition w-full sm:w-auto text-base shadow flex items-center justify-center gap-2"><FaRegClock size={18}/>Nhận thêm ngày</button>
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