import { createContext, useState, useEffect } from 'react'

// Default settings
const getDefaultSettings = () => ({
  notification: {
    enabled: true,
    title: 'THÔNG BÁO HỆ THỐNG',
    content: 'Chào mừng bạn đến với KeyVPN Tool!',
    position: 'before',
    displayCount: 1,
    currentCount: 0,
    hasLink: false,
    linkUrl: '',
    linkText: 'Xem thêm'
  },
  giftKey: {
    defaultExpiration: 30,
    allowMultipleUse: false,
    maxUses: 1
  },
  autoRenewal: {
    enabled: false,
    renewBeforeExpiry: 7,
    defaultDuration: 30
  },
  system: {
    darkMode: false,
    showNotifications: true,
    language: 'vi',
    itemsPerPage: 20
  },
  keyAssignTime: 5,
  giftCode: {
    code: '',
    bonusTime: 0
  },
  toolRuntime: {
    interval: 64,
    accountTarget: 50
  },
  keyExport: {
    linkTemplate: 'link nhập key:'
  }
})

// Tạo Settings Context
const SettingsContext = createContext()

// Settings Provider Component
export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(getDefaultSettings)

  // Load settings từ localStorage khi app khởi động
  useEffect(() => {
    const savedSettings = localStorage.getItem('vpn-settings')
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings)
        setSettings({ ...getDefaultSettings(), ...parsedSettings })
      } catch (error) {
        console.error('Error parsing saved settings:', error)
        setSettings(getDefaultSettings())
      }
    }
  }, [])

  // Hàm cập nhật settings
  const updateSettings = (newSettings) => {
    const updatedSettings = { ...settings, ...newSettings }
    setSettings(updatedSettings)
    localStorage.setItem('vpn-settings', JSON.stringify(updatedSettings))
  }

  // Hàm reset settings về mặc định
  const resetSettings = () => {
    setSettings(getDefaultSettings())
    localStorage.removeItem('vpn-settings')
  }

  // Hàm kiểm tra xem có nên hiển thị thông báo không
  const shouldShowNotification = () => {
    if (!settings.notification.enabled) return false
    return settings.notification.currentCount < settings.notification.displayCount
  }

  // Hàm đánh dấu thông báo đã được hiển thị
  const markNotificationShown = () => {
    const updatedNotification = {
      ...settings.notification,
      currentCount: settings.notification.currentCount + 1
    }
    updateSettings({ notification: updatedNotification })
  }

  // Hàm reset số lần hiển thị thông báo
  const resetNotificationCount = () => {
    const updatedNotification = {
      ...settings.notification,
      currentCount: 0
    }
    updateSettings({ notification: updatedNotification })
  }

  // Hàm kiểm tra gift code
  const validateGiftCode = (inputCode) => {
    if (!settings.giftCode.code) return null
    if (inputCode.toLowerCase() === settings.giftCode.code.toLowerCase()) {
      return settings.giftCode.bonusTime
    }
    return null
  }

  const value = {
    settings,
    updateSettings,
    resetSettings,
    shouldShowNotification,
    markNotificationShown,
    resetNotificationCount,
    validateGiftCode
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export default SettingsContext
