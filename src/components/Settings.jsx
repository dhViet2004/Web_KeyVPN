import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Switch, Select, Typography, Card, Tabs, Form, Space, Divider, App, Table, Modal, Popconfirm } from 'antd'
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
  CopyOutlined
} from '@ant-design/icons'
import { useSettings } from '../hooks/useSettings'
import { settingsAPI, giftAPI } from '../services/api'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings()
  const { message: messageApi } = App.useApp()
  const [form] = Form.useForm()
  const [giftCodes, setGiftCodes] = useState([])
  const [loadingGifts, setLoadingGifts] = useState(false)
  const [createGiftModal, setCreateGiftModal] = useState(false)

  // Load notification từ database khi component mount
  useEffect(() => {
    const loadSettingsFromDatabase = async () => {
      try {
        // Load notification settings
        const isDefaultNotification = 
          settings.notification.title === 'THÔNG BÁO HỆ THỐNG' && 
          settings.notification.content === 'Chào mừng bạn đến với KeyVPN Tool!'
        
        if (isDefaultNotification) {
          const notificationResponse = await settingsAPI.getNotifications()
          if (notificationResponse.success && notificationResponse.data) {
            const dbNotification = notificationResponse.data
            updateSettings({
              notification: {
                ...settings.notification,
                title: dbNotification.title || settings.notification.title,
                content: dbNotification.content || settings.notification.content,
                position: dbNotification.position || settings.notification.position,
                displayCount: dbNotification.display_count || settings.notification.displayCount,
                hasLink: dbNotification.has_link || settings.notification.hasLink,
                linkUrl: dbNotification.link_url || settings.notification.linkUrl,
                linkText: dbNotification.link_text || settings.notification.linkText
              }
            })
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

      } catch (error) {
        console.error('Error loading settings from database:', error)
      }
    }

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

  const updateNotification = (newData) => {
    updateSettings({
      notification: { ...settings.notification, ...newData }
    })
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

      console.log('Creating gift code with data:', giftData) // Debug log

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

  // Load gift codes on component mount
  useEffect(() => {
    loadGiftCodes()
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
      // Save notification settings
      if (settings.notification.enabled) {
        // Save notification to database
        await settingsAPI.updateNotification({
          title: settings.notification.title,
          content: settings.notification.content,
          type: 'info',
          targetAudience: 'all',
          displayCount: settings.notification.displayCount,
          hasLink: settings.notification.hasLink,
          linkUrl: settings.notification.linkUrl || null,
          linkText: settings.notification.linkText || null,
          position: settings.notification.position,
          isActive: true
        })
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
      
      messageApi.success('Cài đặt đã được lưu thành công!')
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
                    onChange={(checked) => updateNotification({ enabled: checked })}
                  />
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
                
                console.log('Modal sending data:', { bonusDays, maxUses }) // Debug log
                
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
      key: 'auto-renewal',
      label: (
        <span>
          <ClockCircleOutlined />
          Gia Hạn Tự Động
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={4}>Cài Đặt Gia Hạn Tự Động</Title>
            
            <Form layout="vertical">
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Bật gia hạn tự động</Text>
                  <Switch 
                    checked={settings.autoRenewal.enabled}
                    onChange={(checked) => updateSettings({
                      autoRenewal: { ...settings.autoRenewal, enabled: checked }
                    })}
                  />
                </div>
              </Form.Item>

              {settings.autoRenewal.enabled && (
                <>
                  <Form.Item label="Gia hạn trước khi hết hạn (ngày)">
                    <InputNumber
                      value={settings.autoRenewal.renewBeforeExpiry}
                      onChange={(value) => updateSettings({
                        autoRenewal: { ...settings.autoRenewal, renewBeforeExpiry: value }
                      })}
                      min={1}
                      max={30}
                      size="large"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>

                  <Form.Item label="Thời gian gia hạn mặc định (ngày)">
                    <InputNumber
                      value={settings.autoRenewal.defaultDuration}
                      onChange={(value) => updateSettings({
                        autoRenewal: { ...settings.autoRenewal, defaultDuration: value }
                      })}
                      min={1}
                      max={365}
                      size="large"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
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
