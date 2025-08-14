import { createContext, useState, useEffect, useRef } from 'react'
import { settingsAPI } from '../services/api'

// Default settings
const getDefaultSettings = () => ({
  notification: {
    enabled: false, // Default to false, will be loaded from database
    title: 'THÔNG BÁO HỆ THỐNG',
    content: 'Chào mừng bạn đến với KeyVPN Tool!',
    position: 'before',
    displayCount: 999, // Increase display count so notification can show multiple times
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
  autoAssignment: {
    enabled: false,
    beforeExpiry: 300, // phút (5 giờ)
    checkInterval: 30, // phút
    deleteExpiredAccounts: true
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
  const [dbLoaded, setDbLoaded] = useState(false) // Track if database has been loaded
  const notificationEnabledRef = useRef(false) // Track notification enabled separately, default false

  // Load settings từ localStorage khi app khởi động
  useEffect(() => {
    const savedSettings = localStorage.getItem('vpn-settings')
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings)
        const defaultSettings = getDefaultSettings()
        
        // Merge settings but exclude notification.enabled from localStorage
        const mergedSettings = { ...defaultSettings, ...parsedSettings }
        if (parsedSettings.notification) {
          mergedSettings.notification = {
            ...defaultSettings.notification,
            ...parsedSettings.notification,
            // Force update displayCount to new default value and reset currentCount
            displayCount: 999,
            currentCount: 0
            // Explicitly exclude enabled - it will be loaded from database
          }
          // Make sure enabled is not overridden by localStorage
          delete mergedSettings.notification.enabled
          mergedSettings.notification.enabled = defaultSettings.notification.enabled
        }
        

        
        // Initialize the ref with default value
        notificationEnabledRef.current = mergedSettings.notification.enabled;
        
        setSettings(mergedSettings)
      } catch (error) {
        console.error('Error parsing saved settings:', error)
        setSettings(getDefaultSettings())
      }
    }
  }, [])

  // Load notification enabled status từ database khi app khởi động
  useEffect(() => {
    const loadNotificationFromDatabase = async () => {
      try {
        const response = await settingsAPI.getNotifications()
        
        if (response.success && response.data) {
          const dbData = response.data
          
          // Update the ref
          notificationEnabledRef.current = dbData.enabled
          
          // Update the settings state with all notification data from database
          setSettings(prevSettings => ({
            ...prevSettings,
            notification: {
              ...prevSettings.notification,
              enabled: dbData.enabled,
              title: dbData.title || prevSettings.notification.title,
              content: dbData.content || prevSettings.notification.content,
              position: dbData.position || prevSettings.notification.position,
              displayCount: dbData.display_count || prevSettings.notification.displayCount,
              currentCount: 0, // Always reset currentCount when loading from database
              hasLink: dbData.has_link || prevSettings.notification.hasLink,
              linkUrl: dbData.link_url || prevSettings.notification.linkUrl,
              linkText: dbData.link_text || prevSettings.notification.linkText
            }
          }))
          
          // Mark database as loaded
          setDbLoaded(true)
        } else {
          // Nếu database không có record, tạo record mặc định
          try {
            await settingsAPI.updateNotificationEnabled(true)
            
            // Set state sau khi tạo record thành công
            notificationEnabledRef.current = true
            setSettings(prevSettings => ({
              ...prevSettings,
              notification: {
                ...prevSettings.notification,
                enabled: true
              }
            }))
          } catch (createError) {
            console.error('SettingsContext - Error creating default record:', createError)
            // Fallback nếu không tạo được record
            notificationEnabledRef.current = true
            setSettings(prevSettings => ({
              ...prevSettings,
              notification: {
                ...prevSettings.notification,
                enabled: true
              }
            }))
            
            // Mark database as loaded even if failed
            setDbLoaded(true)
          }
        }
      } catch (error) {
        console.error('SettingsContext - Error loading notification from database:', error)
        // Nếu có lỗi, set mặc định là true
        notificationEnabledRef.current = true
        
        setSettings(prevSettings => ({
          ...prevSettings,
          notification: {
            ...prevSettings.notification,
            enabled: true
          }
        }))
        
        // Mark database as loaded even if error
        setDbLoaded(true)
      }
    }

    loadNotificationFromDatabase()
  }, [])

  // Hàm cập nhật settings
  const updateSettings = (newSettings) => {
    const updatedSettings = { ...settings, ...newSettings }
    
    // IMPORTANT: Always use the ref value for notification.enabled
    if (updatedSettings.notification) {
      updatedSettings.notification.enabled = notificationEnabledRef.current;
    }
    
    setSettings(updatedSettings)
    
    // Don't save notification.enabled to localStorage as it's managed by database
    const settingsToSave = { ...updatedSettings }
    if (settingsToSave.notification) {
      const { enabled: _enabled, ...notificationWithoutEnabled } = settingsToSave.notification
      settingsToSave.notification = notificationWithoutEnabled
    }
    
    localStorage.setItem('vpn-settings', JSON.stringify(settingsToSave))
  }

  // Hàm cập nhật chỉ notification.enabled (không lưu localStorage)
  const updateNotificationEnabled = (enabled) => {
    // Update the ref first
    notificationEnabledRef.current = enabled;
    
    const updatedSettings = { 
      ...settings, 
      notification: { 
        ...settings.notification, 
        enabled,
        // Reset currentCount to 0 when enabling notification so it can show again
        currentCount: enabled ? 0 : settings.notification.currentCount
      } 
    }
    setSettings(updatedSettings)
  }

  // Hàm reset settings về mặc định
  const resetSettings = () => {
    setSettings(getDefaultSettings())
    localStorage.removeItem('vpn-settings')
  }

  // Hàm kiểm tra xem có nên hiển thị thông báo không
  const shouldShowNotification = () => {
    // Chỉ hiển thị nếu database đã được load
    if (!dbLoaded) {
      return false
    }
    
    // Sử dụng notificationEnabledRef.current để lấy giá trị từ database
    if (!notificationEnabledRef.current) {
      return false
    }
    
    const shouldShow = settings.notification.currentCount < settings.notification.displayCount
    return shouldShow
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
    dbLoaded,
    updateSettings,
    updateNotificationEnabled,
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
