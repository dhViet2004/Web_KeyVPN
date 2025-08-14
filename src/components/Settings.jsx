import { useEffect, useState, useRef } from 'react'
import { Button, Input, InputNumber, Switch, Select, Typography, Card, Tabs, Form, Space, Divider, App, Table, Modal, Popconfirm, Badge, Spin } from 'antd'
import { 
  SettingOutlined, 
  NotificationOutlined, 
  ClockCircleOutlined, 
  GiftOutlined, 
  ToolOutlined,
  SaveOutlined,
  ReloadOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  StopOutlined,
  SyncOutlined
} from '@ant-design/icons'
import { useSettings } from '../hooks/useSettings'
import { settingsAPI, giftAPI, autoAssignmentAPI } from '../services/api'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

function Settings() {
  const { settings, updateSettings, updateNotificationEnabled, resetSettings } = useSettings()
  const { message: messageApi } = App.useApp()
  const [form] = Form.useForm()
  const [giftCodes, setGiftCodes] = useState([])
  const [loadingGifts, setLoadingGifts] = useState(false)
  const [createGiftModal, setCreateGiftModal] = useState(false)
  const [serviceStatus, setServiceStatus] = useState({
    isRunning: false,
    intervalId: false,
    settings: null
  })
  // Add state for auto assignment inputs to prevent auto-save interference
  const [autoAssignmentInputs, setAutoAssignmentInputs] = useState({
    beforeExpiry: 300,
    checkInterval: 30
  })
  const [isEditingAutoAssignment, setIsEditingAutoAssignment] = useState(false)
  const [loadingServiceStatus, setLoadingServiceStatus] = useState(false)
  const hasLoadedFromDatabase = useRef(false)

  // Load notification từ database khi component mount
  useEffect(() => {
    if (hasLoadedFromDatabase.current) return
    
    const loadSettingsFromDatabase = async () => {
      try {
        // Load notification settings
        const notificationResponse = await settingsAPI.getNotifications()
        if (notificationResponse.success && notificationResponse.data) {
          const dbNotification = notificationResponse.data
          
          // Get current settings at the time of API call
          const currentSettings = JSON.parse(localStorage.getItem('vpn-settings') || '{}')
          const defaultNotification = {
            enabled: true,
            title: 'THÔNG BÁO HỆ THỐNG',
            content: 'Chào mừng bạn đến với KeyVPN Tool!',
            position: 'before',
            displayCount: 1,
            currentCount: 0,
            hasLink: false,
            linkUrl: '',
            linkText: 'Xem thêm'
          }
          const currentNotification = currentSettings.notification || defaultNotification
          
          // Update notification content using updateSettings (saves to localStorage)
          updateSettings({
            notification: {
              ...currentNotification,
              title: dbNotification.title || currentNotification.title,
              content: dbNotification.content || currentNotification.content,
              position: dbNotification.position || currentNotification.position,
              displayCount: dbNotification.display_count || currentNotification.displayCount,
              hasLink: dbNotification.has_link || currentNotification.hasLink,
              linkUrl: dbNotification.link_url || currentNotification.linkUrl,
              linkText: dbNotification.link_text || currentNotification.linkText
            }
          })
          
          // Update enabled status separately (doesn't save to localStorage)
          if (dbNotification.enabled !== undefined) {
            updateNotificationEnabled(dbNotification.enabled)
          }
          
        }

        // Load gift key settings
        const giftResponse = await giftAPI.getGiftSettings()
        if (giftResponse.success && giftResponse.data) {
          updateSettings({
            giftKey: {
              defaultExpiration: giftResponse.data.defaultExpiration || 30,
              allowMultipleUse: giftResponse.data.allowMultipleUse || false,
              maxUses: giftResponse.data.maxUses || 1
            }
          })
        }

        // Load auto assignment settings
        try {
          const autoAssignmentResponse = await autoAssignmentAPI.getSettings()
          
          if (autoAssignmentResponse.success && autoAssignmentResponse.data) {
            
            // Update settings in state
            updateSettings({
              autoAssignment: {
                enabled: autoAssignmentResponse.data.enabled || false,
                beforeExpiry: autoAssignmentResponse.data.beforeExpiry || 300,
                checkInterval: autoAssignmentResponse.data.checkInterval || 30,
                deleteExpiredAccounts: autoAssignmentResponse.data.deleteExpiredAccounts !== undefined 
                  ? autoAssignmentResponse.data.deleteExpiredAccounts : true
              }
            });
            
            // Sync input state
            setAutoAssignmentInputs({
              beforeExpiry: autoAssignmentResponse.data.beforeExpiry || 300,
              checkInterval: autoAssignmentResponse.data.checkInterval || 30
            });
            
          }
        } catch {
          // Set default values if not found
          updateSettings({
            autoAssignment: {
              enabled: false,
              beforeExpiry: 300,
              checkInterval: 30,
              deleteExpiredAccounts: true
            }
          });
          setAutoAssignmentInputs({
            beforeExpiry: 300,
            checkInterval: 30
          });
        }

      } catch (error) {
        console.error('Error loading settings from database:', error)
      }
    }

    hasLoadedFromDatabase.current = true
    loadSettingsFromDatabase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Chỉ chạy một lần khi component mount

  // Validation functions
  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  };

  const updateNotification = async (newData) => {
    // If enabled status is being changed, save to database immediately
    if (newData.enabled !== undefined) {
      try {
        const response = await settingsAPI.updateNotificationEnabled(newData.enabled)
        
        if (!response.success) {
          messageApi.error('Lỗi khi lưu trạng thái thông báo')
          return
        } else {
          messageApi.success(newData.enabled ? 'Đã bật thông báo' : 'Đã tắt thông báo')
          // Update context with new enabled status
          updateNotificationEnabled(newData.enabled)
        }
      } catch (error) {
        console.error('Error updating notification enabled:', error)
        messageApi.error('Lỗi khi lưu trạng thái thông báo')
        return
      }
    } else {
      // For other notification fields, only update local context (don't save to database)
      const updatedNotification = { ...settings.notification, ...newData }
      updateSettings({
        notification: updatedNotification
      })
    }
  }

  // Function to save notification content to database (called by saveSettings)
  const saveNotificationToDatabase = async () => {
    try {
      const response = await settingsAPI.updateNotification({
        title: settings.notification.title,
        content: settings.notification.content,
        position: settings.notification.position,
        display_count: settings.notification.displayCount,
        has_link: settings.notification.hasLink,
        link_url: settings.notification.linkUrl,
        link_text: settings.notification.linkText,
        target_audience: 'all',
        type: 'info'
      })
      
      if (response.success) {
        return { success: true }
      } else {
        console.error('Failed to save notification content:', response.message);
        return { success: false, message: response.message }
      }
    } catch (error) {
      console.error('Error saving notification content to database:', error);
      return { success: false, message: error.message }
    }
  }

  const validateNotificationForm = () => {
    const errors = []
    
    if (!settings.notification.title.trim()) {
      errors.push('Tiêu đề thông báo không được để trống')
    }
    
    if (!settings.notification.content.trim()) {
      errors.push('Nội dung thông báo không được để trống')
    }
    
    if (settings.notification.hasLink && settings.notification.linkUrl) {
      if (!isValidUrl(settings.notification.linkUrl)) {
        errors.push('URL link không hợp lệ')
      }
    }
    
    if (settings.notification.hasLink && !settings.notification.linkText.trim()) {
      errors.push('Text link không được để trống khi có link')
    }
    
    return errors
  }

  // Gift codes management functions
  const loadGiftCodes = async () => {
    setLoadingGifts(true)
    try {
      const response = await giftAPI.getGiftCodes()
      if (response.success) {
        setGiftCodes(response.data || [])
      }
    } catch (error) {
      console.error('Error loading gift codes:', error)
      messageApi.error('Lỗi khi tải danh sách gift codes')
    }
    setLoadingGifts(false)
  }

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const createGiftCode = async (values) => {
    try {
      const giftData = {
        code: values.code || generateRandomCode(),
        bonus_days: values.bonusDays || settings.giftKey.defaultExpiration,
        max_uses: values.maxUses || (settings.giftKey.allowMultipleUse ? settings.giftKey.maxUses : 1),
        expires_at: values.expiresAt || null
      }

      const response = await giftAPI.createGift(giftData)
      if (response.success) {
        messageApi.success('Tạo gift code thành công!')
        setCreateGiftModal(false)
        loadGiftCodes() // Reload list
        
        // Copy code to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(giftData.code)
          messageApi.info('Đã copy gift code vào clipboard!')
        }
      } else {
        messageApi.error(response.message || 'Lỗi khi tạo gift code')
      }
    } catch (error) {
      console.error('Error creating gift code:', error)
      if (error.message.includes('Validation failed')) {
        messageApi.error('Dữ liệu không hợp lệ. Vui lòng kiểm tra lại cài đặt.')
      } else {
        messageApi.error('Lỗi khi tạo gift code')
      }
    }
  }

  const copyToClipboard = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      messageApi.success('Đã copy vào clipboard!')
    }
  }

  // Auto assignment service functions
  const loadServiceStatus = async () => {
    setLoadingServiceStatus(true)
    try {
      const response = await autoAssignmentAPI.getStatus()
      if (response.success) {
        setServiceStatus(response.data)
        // Sync input state with server data only if not editing
        if (response.data.settings && !isEditingAutoAssignment) {
          setAutoAssignmentInputs({
            beforeExpiry: response.data.settings.beforeExpiry || 300,
            checkInterval: response.data.settings.checkInterval || 30
          });
        }
      }
    } catch (error) {
      console.error('Error loading service status:', error)
    }
    setLoadingServiceStatus(false)
  }

  const startService = async () => {
    try {
      const response = await autoAssignmentAPI.start()
      if (response.success) {
        messageApi.success('Đã khởi động dịch vụ gán key tự động')
        loadServiceStatus()
      } else {
        messageApi.error(response.message || 'Lỗi khi khởi động dịch vụ')
      }
    } catch (error) {
      console.error('Error starting service:', error)
      messageApi.error('Lỗi khi khởi động dịch vụ')
    }
  }

  const stopService = async () => {
    try {
      const response = await autoAssignmentAPI.stop()
      if (response.success) {
        messageApi.success('Đã dừng dịch vụ gán key tự động')
        loadServiceStatus()
      } else {
        messageApi.error(response.message || 'Lỗi khi dừng dịch vụ')
      }
    } catch (error) {
      console.error('Error stopping service:', error)
      messageApi.error('Lỗi khi dừng dịch vụ')
    }
  }

  const runServiceNow = async () => {
    try {
      const response = await autoAssignmentAPI.runNow()
      if (response.success) {
        messageApi.success('Đã chạy kiểm tra và gán key ngay lập tức')
      } else {
        messageApi.error(response.message || 'Lỗi khi chạy dịch vụ')
      }
    } catch (error) {
      console.error('Error running service now:', error)
      messageApi.error('Lỗi khi chạy dịch vụ')
    }
  }

  // Save auto assignment settings to database
  const saveAutoAssignmentSettings = async (newSettings) => {
    try {
      
      // Ensure all required fields are present and valid
      const settingsToSave = {
        enabled: Boolean(newSettings.enabled),
        beforeExpiry: newSettings.beforeExpiry !== null && newSettings.beforeExpiry !== undefined ? Number(newSettings.beforeExpiry) : 300,
        checkInterval: newSettings.checkInterval !== null && newSettings.checkInterval !== undefined ? Number(newSettings.checkInterval) : 30,
        deleteExpiredAccounts: newSettings.deleteExpiredAccounts !== undefined ? Boolean(newSettings.deleteExpiredAccounts) : true
      };

      // Validate the numbers
      if (isNaN(settingsToSave.beforeExpiry) || settingsToSave.beforeExpiry < 1 || settingsToSave.beforeExpiry > 1440) {
        throw new Error('Before expiry must be between 1-1440 minutes');
      }

      if (isNaN(settingsToSave.checkInterval) || settingsToSave.checkInterval < 1 || settingsToSave.checkInterval > 360) {
        throw new Error('Check interval must be between 1-360 minutes');
      }

      const response = await autoAssignmentAPI.updateSettings(settingsToSave);
      
      if (response.success) {
        messageApi.success('Đã lưu cài đặt gán key tự động');
        // Reload service status to get updated data
        await loadServiceStatus();
        return true;
      } else {
        throw new Error(response.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Save auto assignment settings error:', error);
      messageApi.error('Lỗi khi lưu cài đặt gán key tự động: ' + error.message);
      return false;
    }
  }

  // Load gift codes on component mount
  useEffect(() => {
    loadGiftCodes()
    loadServiceStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSettings = async () => {
    // Validate form trước khi save
    const validationErrors = validateNotificationForm()
    if (validationErrors.length > 0) {
      messageApi.error({
        content: (
          <div>
            <div>Vui lòng sửa các lỗi sau:</div>
            {validationErrors.map((error, index) => (
              <div key={index}>• {error}</div>
            ))}
          </div>
        ),
        duration: 5
      })
      return
    }

    try {
      // Save notification content to database
      if (settings.notification.enabled) {
        const notificationSaveResult = await saveNotificationToDatabase()
        if (!notificationSaveResult.success) {
          messageApi.error('Lỗi khi lưu nội dung thông báo: ' + notificationSaveResult.message)
          return
        }
      } else {
        // Disable all notifications in database  
        await settingsAPI.disableNotifications()
      }

      // Save gift key settings
      await giftAPI.updateGiftSettings({
        defaultExpiration: settings.giftKey.defaultExpiration,
        allowMultipleUse: settings.giftKey.allowMultipleUse,
        maxUses: settings.giftKey.maxUses
      })

      // Save auto assignment settings - use the validated save function
      if (settings.autoAssignment) {
        const autoSaveResult = await saveAutoAssignmentSettings(settings.autoAssignment)
        if (!autoSaveResult) {
          // Auto assignment save failed, but other settings may have succeeded
          messageApi.warning('Cài đặt thông báo và gift key đã lưu, nhưng có lỗi với cài đặt gán key tự động')
          return
        }
      }
      
      messageApi.success('Tất cả cài đặt đã được lưu thành công!')
    } catch (error) {
      console.error('Error saving settings:', error)
      messageApi.error('Có lỗi xảy ra khi lưu cài đặt!')
    }
  }

  const tabItems = [
    {
      key: 'notification',
      label: (
        <span>
          <NotificationOutlined />
          Thông Báo
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Form form={form} layout="vertical">
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Bật/Tắt thông báo</Text>
                  <Switch 
                    checked={settings.notification.enabled}
                    onChange={(checked) => {
                      updateNotification({ enabled: checked });
                    }}
                  />
                  <Text style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                    Current: {settings.notification.enabled ? 'ON' : 'OFF'}
                  </Text>
                </div>
              </Form.Item>

              {settings.notification.enabled && (
                <>
                  <Form.Item 
                    label="Tiêu đề thông báo"
                    validateStatus={!settings.notification.title.trim() ? 'error' : ''}
                    help={!settings.notification.title.trim() ? 'Tiêu đề không được để trống' : ''}
                  >
                    <Input
                      value={settings.notification.title}
                      onChange={(e) => updateNotification({ title: e.target.value })}
                      placeholder="Nhập tiêu đề thông báo"
                      size="large"
                      maxLength={100}
                      showCount
                    />
                  </Form.Item>

                  <Form.Item 
                    label="Nội dung thông báo"
                    validateStatus={!settings.notification.content.trim() ? 'error' : ''}
                    help={!settings.notification.content.trim() ? 'Nội dung không được để trống' : ''}
                  >
                    <TextArea
                      value={settings.notification.content}
                      onChange={(e) => updateNotification({ content: e.target.value })}
                      placeholder="Nhập nội dung thông báo"
                      rows={4}
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>

                  <Form.Item label="Vị trí hiển thị">
                    <Select
                      value={settings.notification.position}
                      onChange={(value) => updateNotification({ position: value })}
                      size="large"
                    >
                      <Option value="before">Trước danh sách key</Option>
                      <Option value="after">Sau danh sách key</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item label="Số lần hiển thị tối đa">
                    <InputNumber
                      value={settings.notification.displayCount}
                      onChange={(value) => updateNotification({ displayCount: value })}
                      min={1}
                      max={10}
                      size="large"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>

                  <Form.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong>Có link trong thông báo</Text>
                      <Switch 
                        checked={settings.notification.hasLink}
                        onChange={(checked) => updateNotification({ hasLink: checked })}
                      />
                    </div>
                  </Form.Item>

                  {settings.notification.hasLink && (
                    <>
                      <Form.Item 
                        label="URL Link"
                        help={settings.notification.linkUrl && !isValidUrl(settings.notification.linkUrl) ? 'URL không hợp lệ' : ''}
                        validateStatus={settings.notification.linkUrl && !isValidUrl(settings.notification.linkUrl) ? 'error' : ''}
                      >
                        <Input
                          value={settings.notification.linkUrl}
                          onChange={(e) => updateNotification({ linkUrl: e.target.value })}
                          placeholder="https://example.com"
                          size="large"
                          maxLength={500}
                        />
                      </Form.Item>

                      <Form.Item 
                        label="Text Link"
                        validateStatus={settings.notification.hasLink && !settings.notification.linkText.trim() ? 'error' : ''}
                        help={settings.notification.hasLink && !settings.notification.linkText.trim() ? 'Text link không được để trống' : ''}
                      >
                        <Input
                          value={settings.notification.linkText}
                          onChange={(e) => updateNotification({ linkText: e.target.value })}
                          placeholder="Nhập text hiển thị cho link"
                          size="large"
                          maxLength={50}
                          showCount
                        />
                      </Form.Item>
                    </>
                  )}

                  <Divider />

                  <div style={{ marginBottom: 16 }}>
                    <Text strong>Xem trước thông báo:</Text>
                  </div>
                  <div style={{ 
                    padding: 16, 
                    border: '1px solid #d9d9d9', 
                    borderRadius: 6, 
                    backgroundColor: '#f6ffed',
                    borderColor: '#b7eb8f'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#52c41a' }}>
                      <NotificationOutlined /> {settings.notification.title || 'Tiêu đề thông báo'}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      {settings.notification.content || 'Nội dung thông báo sẽ hiển thị ở đây...'}
                    </div>
                    {settings.notification.hasLink && settings.notification.linkText && (
                      <div>
                        <Button 
                          type="link" 
                          icon={<LinkOutlined />}
                          style={{ padding: 0 }}
                        >
                          {settings.notification.linkText}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Form>
          </Space>
        </Card>
      )
    },
    {
      key: 'gift',
      label: (
        <span>
          <GiftOutlined />
          Gift Key
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={4}>Cài Đặt Gift Key</Title>
            
            <Form layout="vertical">
              <Form.Item label="Thời gian cộng thêm mặc định (ngày)">
                <InputNumber
                  value={settings.giftKey.defaultExpiration}
                  onChange={(value) => updateSettings({
                    giftKey: { ...settings.giftKey, defaultExpiration: value }
                  })}
                  min={1}
                  max={365}
                  size="large"
                  style={{ width: '100%' }}
                  addonAfter="ngày"
                  placeholder="Số ngày sẽ cộng thêm vào key"
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Khi user nhập gift code, key sẽ được gia hạn thêm số ngày này
                </Text>
              </Form.Item>

              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Cho phép sử dụng nhiều lần</Text>
                  <Switch 
                    checked={settings.giftKey.allowMultipleUse}
                    onChange={(checked) => updateSettings({
                      giftKey: { ...settings.giftKey, allowMultipleUse: checked }
                    })}
                  />
                </div>
              </Form.Item>

              <Form.Item label="Số lần sử dụng tối đa">
                <InputNumber
                  value={settings.giftKey.maxUses}
                  onChange={(value) => updateSettings({
                    giftKey: { ...settings.giftKey, maxUses: value }
                  })}
                  min={1}
                  max={100}
                  size="large"
                  style={{ width: '100%' }}
                  disabled={!settings.giftKey.allowMultipleUse}
                />
              </Form.Item>
            </Form>

            <Divider />

            {/* Gift Codes Management */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4}>Quản Lý Gift Codes</Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateGiftModal(true)}
              >
                Tạo Gift Code
              </Button>
            </div>

            <Table
              dataSource={giftCodes}
              loading={loadingGifts}
              rowKey="id"
              size="small"
              columns={[
                {
                  title: 'Gift Code',
                  dataIndex: 'code',
                  key: 'code',
                  render: (code) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text code style={{ margin: 0 }}>{code}</Text>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(code)}
                        title="Copy code"
                      />
                    </div>
                  ),
                },
                {
                  title: 'Thời gian cộng thêm',
                  dataIndex: 'bonus_days',
                  key: 'bonus_days',
                  width: 140,
                  render: (days) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ClockCircleOutlined style={{ color: '#1890ff' }} />
                      <Text strong style={{ color: '#1890ff' }}>+{days} ngày</Text>
                    </div>
                  ),
                },
                {
                  title: 'Lượt sử dụng',
                  key: 'usage',
                  width: 120,
                  render: (_, record) => (
                    <Text>{record.current_uses}/{record.max_uses}</Text>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'is_active',
                  key: 'status',
                  width: 100,
                  render: (isActive, record) => {
                    if (!isActive) return <Text type="secondary">Tắt</Text>
                    if (record.expires_at && new Date() > new Date(record.expires_at)) {
                      return <Text type="danger">Hết hạn</Text>
                    }
                    if (record.current_uses >= record.max_uses) {
                      return <Text type="warning">Hết lượt</Text>
                    }
                    return <Text type="success">Hoạt động</Text>
                  },
                },
                {
                  title: 'Hành động',
                  key: 'actions',
                  width: 80,
                  render: () => (
                    <Popconfirm
                      title="Xóa gift code này?"
                      onConfirm={() => {
                        // Handle delete - will implement later
                        messageApi.info('Tính năng xóa sẽ được cập nhật sau')
                      }}
                      okText="Xóa"
                      cancelText="Hủy"
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        title="Xóa"
                      />
                    </Popconfirm>
                  ),
                },
              ]}
              pagination={{
                pageSize: 5,
                showSizeChanger: false,
              }}
            />

            {/* Create Gift Code Modal */}
            <Modal
              title="Tạo Gift Code Mới"
              open={createGiftModal}
              onCancel={() => setCreateGiftModal(false)}
              onOk={() => {
                const bonusDays = settings.giftKey.defaultExpiration
                const maxUses = settings.giftKey.allowMultipleUse ? settings.giftKey.maxUses : 1
                
                createGiftCode({
                  bonusDays,
                  maxUses
                })
              }}
              okText="Tạo Gift Code"
              cancelText="Hủy"
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text strong>Gift Code sẽ được tạo với cài đặt hiện tại:</Text>
                </div>
                
                <div style={{ padding: 16, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text>• <strong>Mã code:</strong> Tự động tạo (8 ký tự)</Text>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text>• <strong>Thời gian cộng thêm:</strong> +{settings.giftKey.defaultExpiration} ngày vào key</Text>
                  </div>
                  <div>
                    <Text>• <strong>Số lần sử dụng:</strong> {settings.giftKey.allowMultipleUse ? settings.giftKey.maxUses : 1} lần</Text>
                  </div>
                </div>
                
                <div>
                  <Text type="secondary">
                    Mã gift code sẽ được tự động copy vào clipboard sau khi tạo thành công.
                  </Text>
                </div>
              </Space>
            </Modal>
          </Space>
        </Card>
      )
    },
    {
      key: 'auto-assignment',
      label: (
        <span>
          <ClockCircleOutlined />
          Gán Key Tự Động
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={4}>Cài Đặt Gán Key Tự Động</Title>
            
            <div style={{ padding: 12, backgroundColor: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd' }}>
              <Text type="secondary" style={{ fontSize: 14 }}>
                💡 Trong khoảng thời gian trước khi tài khoản hết hạn, nếu có tài khoản mới trống thì hệ thống sẽ tự động chuyển key sang tài khoản mới.
              </Text>
            </div>
            
            <Form layout="vertical">
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text strong>Bật gán key tự động</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Tự động chuyển key sang tài khoản mới
                      </Text>
                    </div>
                  </div>
                  <Switch 
                    checked={settings.autoAssignment?.enabled || false}
                    onChange={async (checked) => {
                      const currentSettings = settings.autoAssignment || {}
                      const newSettings = {
                        enabled: checked,
                        beforeExpiry: autoAssignmentInputs.beforeExpiry !== null && autoAssignmentInputs.beforeExpiry !== undefined 
                          ? autoAssignmentInputs.beforeExpiry 
                          : currentSettings.beforeExpiry || 300,
                        checkInterval: autoAssignmentInputs.checkInterval !== null && autoAssignmentInputs.checkInterval !== undefined
                          ? autoAssignmentInputs.checkInterval
                          : currentSettings.checkInterval || 30,
                        deleteExpiredAccounts: currentSettings.deleteExpiredAccounts !== undefined
                          ? currentSettings.deleteExpiredAccounts : true
                      }
                      
                      // Update UI state first
                      updateSettings({
                        autoAssignment: newSettings
                      })
                      
                      // Save to database immediately
                      const saveResult = await saveAutoAssignmentSettings(newSettings)
                      if (!saveResult) {
                        // Revert UI state if save failed
                        updateSettings({
                          autoAssignment: {
                            ...newSettings,
                            enabled: !checked // revert the toggle
                          }
                        })
                      }
                    }}
                    size="default"
                  />
                </div>
              </Form.Item>

              {settings.autoAssignment?.enabled && (
                <>
                  <Form.Item label="Thời gian chuyển đổi key (phút)">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <InputNumber
                        value={autoAssignmentInputs.beforeExpiry}
                        onChange={(value) => {
                          // Mark as editing to prevent auto-load override
                          setIsEditingAutoAssignment(true);
                          // Update local state immediately - allow null/undefined for editing
                          setAutoAssignmentInputs(prev => ({
                            ...prev,
                            beforeExpiry: value
                          }));
                        }}
                        onFocus={() => setIsEditingAutoAssignment(true)}
                        onBlur={async () => {
                          // Save when user finishes editing
                          setIsEditingAutoAssignment(false);
                          
                          // Use default value if empty
                          const finalValue = autoAssignmentInputs.beforeExpiry !== null && autoAssignmentInputs.beforeExpiry !== undefined 
                            ? autoAssignmentInputs.beforeExpiry 
                            : 300;
                          
                          // Update local state with final value
                          setAutoAssignmentInputs(prev => ({
                            ...prev,
                            beforeExpiry: finalValue
                          }));
                          
                          const currentSettings = settings.autoAssignment || {}
                          const newSettings = {
                            enabled: currentSettings.enabled || false,
                            beforeExpiry: finalValue,
                            checkInterval: currentSettings.checkInterval || 30,
                            deleteExpiredAccounts: currentSettings.deleteExpiredAccounts !== undefined
                              ? currentSettings.deleteExpiredAccounts : true
                          }
                          updateSettings({
                            autoAssignment: newSettings
                          })
                          await saveAutoAssignmentSettings(newSettings)
                        }}
                        min={1}
                        max={1440}
                        size="large"
                        style={{ width: 120 }}
                      />
                      <Text>phút</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Trong khoảng thời gian này trước khi hết hạn, nếu có tài khoản mới trống thì hệ thống sẽ chuyển key sang tài khoản mới. Thời gian để admin cập nhật danh sách tài khoản mới.
                    </Text>
                  </Form.Item>

                  <Form.Item label="Thời gian kiểm tra định kỳ">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <InputNumber
                        value={autoAssignmentInputs.checkInterval}
                        onChange={(value) => {
                          // Mark as editing to prevent auto-load override
                          setIsEditingAutoAssignment(true);
                          // Update local state immediately - allow null/undefined for editing
                          setAutoAssignmentInputs(prev => ({
                            ...prev,
                            checkInterval: value
                          }));
                        }}
                        onFocus={() => setIsEditingAutoAssignment(true)}
                        onBlur={async () => {
                          // Save when user finishes editing
                          setIsEditingAutoAssignment(false);
                          
                          // Use default value if empty
                          const finalValue = autoAssignmentInputs.checkInterval !== null && autoAssignmentInputs.checkInterval !== undefined 
                            ? autoAssignmentInputs.checkInterval 
                            : 30;
                          
                          // Update local state with final value
                          setAutoAssignmentInputs(prev => ({
                            ...prev,
                            checkInterval: finalValue
                          }));
                          
                          const currentSettings = settings.autoAssignment || {}
                          const newSettings = {
                            enabled: currentSettings.enabled || false,
                            beforeExpiry: currentSettings.beforeExpiry || 300,
                            checkInterval: finalValue,
                            deleteExpiredAccounts: currentSettings.deleteExpiredAccounts !== undefined
                              ? currentSettings.deleteExpiredAccounts : true
                          }
                          updateSettings({
                            autoAssignment: newSettings
                          })
                          await saveAutoAssignmentSettings(newSettings)
                        }}
                        min={1}
                        max={360}
                        size="large"
                        style={{ width: 120 }}
                      />
                      <Text>phút</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Hệ thống sẽ kiểm tra và gán key tự động mỗi khoảng thời gian này.
                    </Text>
                  </Form.Item>

                  <div style={{ padding: 12, backgroundColor: '#fef3c7', borderRadius: 6, border: '1px solid #fbbf24' }}>
                    <Text style={{ fontSize: 13, color: '#92400e' }}>
                      ⚠️ <strong>Lưu ý:</strong> Chức năng này chỉ hoạt động khi có key còn trống trong hệ thống. 
                      Đảm bảo luôn có key dự phòng để tránh gián đoạn dịch vụ.
                    </Text>
                  </div>

                  <Divider />

                  {/* Service Status Section */}
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Title level={5} style={{ margin: 0 }}>Trạng thái dịch vụ</Title>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={loadServiceStatus}
                        loading={loadingServiceStatus}
                        size="small"
                      >
                        Làm mới
                      </Button>
                    </div>

                    <Card size="small" style={{ backgroundColor: '#f9fafb' }}>
                      <Spin spinning={loadingServiceStatus}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* Service Status */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>Trạng thái:</Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Badge 
                                status={serviceStatus.isRunning ? 'processing' : 'default'} 
                              />
                              <Text strong style={{ color: serviceStatus.isRunning ? '#52c41a' : '#d9d9d9' }}>
                                {serviceStatus.isRunning ? 'Đang chạy' : 'Đã dừng'}
                              </Text>
                            </div>
                          </div>

                          {/* Current Settings Summary */}
                          {serviceStatus.settings && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text>Cấu hình hiện tại:</Text>
                              <Text type="secondary">
                                Kiểm tra mỗi {serviceStatus.settings.checkInterval}p | 
                                Chuyển key trong {serviceStatus.settings.beforeExpiry}p trước hết hạn
                              </Text>
                            </div>
                          )}

                          {/* Control Buttons */}
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                            <Button
                              icon={<PlayCircleOutlined />}
                              type="primary"
                              size="small"
                              onClick={startService}
                              disabled={serviceStatus.isRunning}
                            >
                              Khởi động
                            </Button>
                            <Button
                              icon={<StopOutlined />}
                              size="small"
                              onClick={stopService}
                              disabled={!serviceStatus.isRunning}
                            >
                              Dừng lại
                            </Button>
                            <Button
                              icon={<SyncOutlined />}
                              size="small"
                              onClick={runServiceNow}
                              disabled={!serviceStatus.isRunning}
                            >
                              Chạy ngay
                            </Button>
                          </div>
                        </div>
                      </Spin>
                    </Card>

                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Dịch vụ sẽ tự động khởi động khi server khởi động và settings được bật.
                    </Text>
                  </div>
                </>
              )}
            </Form>
          </Space>
        </Card>
      )
    },
    {
      key: 'system',
      label: (
        <span>
          <ToolOutlined />
          Hệ Thống
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={4}>Cài Đặt Hệ Thống</Title>
            
            <Form layout="vertical">
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Chế độ tối</Text>
                  <Switch 
                    checked={settings.system.darkMode}
                    onChange={(checked) => updateSettings({
                      system: { ...settings.system, darkMode: checked }
                    })}
                  />
                </div>
              </Form.Item>

              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Hiển thị thông báo hệ thống</Text>
                  <Switch 
                    checked={settings.system.showNotifications}
                    onChange={(checked) => updateSettings({
                      system: { ...settings.system, showNotifications: checked }
                    })}
                  />
                </div>
              </Form.Item>

              <Form.Item label="Ngôn ngữ">
                <Select
                  value={settings.system.language}
                  onChange={(value) => updateSettings({
                    system: { ...settings.system, language: value }
                  })}
                  size="large"
                >
                  <Option value="vi">Tiếng Việt</Option>
                  <Option value="en">English</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Số mục hiển thị mỗi trang">
                <InputNumber
                  value={settings.system.itemsPerPage}
                  onChange={(value) => updateSettings({
                    system: { ...settings.system, itemsPerPage: value }
                  })}
                  min={10}
                  max={100}
                  size="large"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
          </Space>
        </Card>
      )
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>
          <SettingOutlined /> Cài Đặt Hệ Thống
        </Title>
      </div>

      <Tabs 
        items={tabItems}
        size="large"
        type="card"
      />

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Space size="middle">
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            size="large"
            onClick={saveSettings}
          >
            Lưu Cài Đặt
          </Button>
          
          <Button 
            icon={<ReloadOutlined />} 
            size="large"
            onClick={resetSettings}
          >
            Khôi Phục Mặc Định
          </Button>
        </Space>
      </div>
    </div>
  )
}

export default Settings
