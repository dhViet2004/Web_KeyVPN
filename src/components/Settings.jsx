import { Button, Input, InputNumber, Switch, Select, Typography, Card, Tabs, Form, Space, Divider, App } from 'antd'
import { 
  SettingOutlined, 
  NotificationOutlined, 
  ClockCircleOutlined, 
  GiftOutlined, 
  ToolOutlined,
  SaveOutlined,
  ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons'
import { useSettings } from '../hooks/useSettings'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs

function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings()
  const { message: messageApi } = App.useApp()
  const [form] = Form.useForm()

  // Lưu settings
  const saveSettings = () => {
    // Hiển thị thông báo thành công ngay lập tức
    messageApi.success('Cài đặt đã được lưu thành công!')
    
    // Force save tất cả settings hiện tại với delay nhỏ
    setTimeout(() => {
      updateSettings({ ...settings })
    }, 100)
  }

  // Reset về mặc định
  const handleResetSettings = () => {
    resetSettings()
    form.resetFields()
    messageApi.success('Đã reset về cài đặt mặc định!')
  }

  // Update notification
  const updateNotification = (updates) => {
    updateSettings({
      notification: { ...settings.notification, ...updates }
    })
  }

  // Update key assign time
  const updateKeyAssignTime = (time) => {
    updateSettings({ keyAssignTime: time })
  }

  // Update gift code
  const updateGiftCode = (updates) => {
    updateSettings({
      giftCode: { ...settings.giftCode, ...updates }
    })
  }

  // Update tool runtime
  const updateToolRuntime = (updates) => {
    updateSettings({
      toolRuntime: { ...settings.toolRuntime, ...updates }
    })
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <Card className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <SettingOutlined className="text-2xl text-blue-500" />
          <Title level={2} className="!mb-0">Cài đặt hệ thống</Title>
        </div>
        <Text type="secondary">Tùy chỉnh các thông số hoạt động của tool</Text>
      </Card>

      <Tabs defaultActiveKey="1" type="card" size="large">
        {/* Tab Thông báo */}
        <TabPane 
          tab={
            <span>
              <NotificationOutlined />
              Thông báo
            </span>
          } 
          key="1"
        >
          <Card title="Cài đặt thông báo" className="mb-4">
            <Form layout="vertical" form={form}>
              <Space direction="vertical" size="large" className="w-full">
                <Form.Item label="Trạng thái thông báo">
                  <Switch
                    checked={settings.notification.enabled}
                    onChange={(checked) => updateNotification({ enabled: checked })}
                    checkedChildren="Bật"
                    unCheckedChildren="Tắt"
                  />
                  <Text type="secondary" className="ml-3">
                    {settings.notification.enabled ? 'Thông báo đang được bật' : 'Thông báo đang bị tắt'}
                  </Text>
                </Form.Item>

                <Form.Item label="Tên thông báo">
                  <Input
                    value={settings.notification.title}
                    onChange={(e) => updateNotification({ title: e.target.value.toUpperCase() })}
                    placeholder="TÊN THÔNG BÁO"
                    size="large"
                  />
                </Form.Item>

                <Form.Item label="Nội dung thông báo">
                  <TextArea
                    value={settings.notification.content}
                    onChange={(e) => updateNotification({ content: e.target.value })}
                    placeholder="Nhập nội dung thông báo..."
                    rows={4}
                    size="large"
                  />
                </Form.Item>

                <Form.Item label="Vị trí xuất hiện">
                  <Select
                    value={settings.notification.position}
                    onChange={(value) => updateNotification({ position: value })}
                    size="large"
                    className="w-full"
                  >
                    <Option value="before">Trước khi nhập key</Option>
                    <Option value="after">Sau khi nhập key</Option>
                  </Select>
                </Form.Item>

                <Form.Item label="Số lần xuất hiện">
                  <InputNumber
                    min={1}
                    max={10}
                    value={settings.notification.displayCount}
                    onChange={(value) => updateNotification({ displayCount: value })}
                    size="large"
                    className="w-full"
                  />
                </Form.Item>

                <Divider />

                <Form.Item label="Kèm theo link">
                  <Switch
                    checked={settings.notification.hasLink}
                    onChange={(checked) => updateNotification({ hasLink: checked })}
                    checkedChildren="Có"
                    unCheckedChildren="Không"
                  />
                  <Text type="secondary" className="ml-3">
                    {settings.notification.hasLink ? 'Thông báo sẽ có link đính kèm' : 'Thông báo không có link'}
                  </Text>
                </Form.Item>

                {settings.notification.hasLink && (
                  <>
                    <Form.Item label="URL Link">
                      <Input
                        value={settings.notification.linkUrl}
                        onChange={(e) => updateNotification({ linkUrl: e.target.value })}
                        placeholder="https://example.com"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item label="Tên hiển thị link">
                      <Input
                        value={settings.notification.linkText}
                        onChange={(e) => updateNotification({ linkText: e.target.value })}
                        placeholder="Xem thêm"
                        size="large"
                      />
                    </Form.Item>
                  </>
                )}
              </Space>
            </Form>
          </Card>

          {/* Preview thông báo */}
          {settings.notification.enabled && (
            <Card 
              title={
                <span>
                  <EyeOutlined className="mr-2" />
                  Xem trước thông báo
                </span>
              }
              className="bg-gradient-to-r from-blue-50 to-purple-50"
            >
              <div className="bg-white p-6 rounded-lg border-l-4 border-blue-500 shadow-sm">
                <Title level={4} className="!text-blue-600 !mb-3">
                  {settings.notification.title}
                </Title>
                <Text className="text-gray-700 text-base leading-relaxed">
                  {settings.notification.content}
                </Text>
                {settings.notification.hasLink && settings.notification.linkUrl && (
                  <div className="mt-4">
                    <Button 
                      type="link" 
                      href={settings.notification.linkUrl}
                      target="_blank"
                      className="!p-0 !text-blue-500 hover:!text-blue-700"
                    >
                      {settings.notification.linkText || 'Xem thêm'} →
                    </Button>
                  </div>
                )}
                <Divider />
                <Text type="secondary" className="text-sm">
                  <ClockCircleOutlined className="mr-1" />
                  Xuất hiện: {settings.notification.position === 'before' ? 'Trước' : 'Sau'} khi nhập key
                  <span className="mx-2">•</span>
                  Số lần: {settings.notification.displayCount}
                  {settings.notification.hasLink && (
                    <>
                      <span className="mx-2">•</span>
                      Có link đính kèm
                    </>
                  )}
                </Text>
              </div>
            </Card>
          )}
        </TabPane>

        {/* Tab Thời gian key */}
        <TabPane 
          tab={
            <span>
              <ClockCircleOutlined />
              Thời gian key
            </span>
          } 
          key="2"
        >
          <Card title="Cài đặt thời gian key gán tài khoản">
            <Form layout="vertical">
              <Form.Item 
                label="Thời gian còn lại để gán key mới (giờ)"
                help="Khi tài khoản còn ít thời gian hơn số giờ này, key mới sẽ được gán tự động"
              >
                <Space>
                  <InputNumber
                    min={1}
                    max={24}
                    value={settings.keyAssignTime}
                    onChange={updateKeyAssignTime}
                    size="large"
                    addonAfter="giờ"
                  />
                  <Text type="secondary">
                    Mặc định: 5 giờ
                  </Text>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        {/* Tab Gift Code */}
        <TabPane 
          tab={
            <span>
              <GiftOutlined />
              Gift Code
            </span>
          } 
          key="3"
        >
          <Card title="Cài đặt Gift Code">
            <Form layout="vertical">
              <Space direction="vertical" size="large" className="w-full">
                <Form.Item label="Tên code">
                  <Input
                    value={settings.giftCode.code}
                    onChange={(e) => updateGiftCode({ code: e.target.value })}
                    placeholder="Nhập tên gift code..."
                    size="large"
                  />
                </Form.Item>

                <Form.Item label="Thời gian tặng thêm (giờ)">
                  <InputNumber
                    min={0}
                    value={settings.giftCode.bonusTime}
                    onChange={(value) => updateGiftCode({ bonusTime: value })}
                    placeholder="0"
                    size="large"
                    addonAfter="giờ"
                    className="w-full"
                  />
                </Form.Item>
              </Space>
            </Form>
          </Card>
        </TabPane>

        {/* Tab Tool Runtime */}
        <TabPane 
          tab={
            <span>
              <ToolOutlined />
              Thời gian chạy tool
            </span>
          } 
          key="4"
        >
          <Card title="Cài đặt thời gian chạy tool">
            <Form layout="vertical">
              <Space direction="vertical" size="large" className="w-full">
                <Form.Item 
                  label="Chu kỳ chạy tool (giờ)"
                  help={`Tool sẽ chạy mỗi ${settings.toolRuntime.interval} tiếng`}
                >
                  <InputNumber
                    min={1}
                    value={settings.toolRuntime.interval}
                    onChange={(value) => updateToolRuntime({ interval: value })}
                    size="large"
                    addonAfter="giờ"
                    className="w-full"
                  />
                </Form.Item>

                <Form.Item 
                  label="Số lượng tài khoản tạo ra mỗi lần"
                  help={`Tối thiểu ${settings.toolRuntime.accountTarget} tài khoản sẽ được tạo mỗi ${settings.toolRuntime.interval} tiếng`}
                >
                  <InputNumber
                    min={1}
                    value={settings.toolRuntime.accountTarget}
                    onChange={(value) => updateToolRuntime({ accountTarget: value })}
                    size="large"
                    addonAfter="tài khoản"
                    className="w-full"
                  />
                </Form.Item>
              </Space>
            </Form>
          </Card>
        </TabPane>
      </Tabs>

      {/* Action Buttons */}
      <Card className="mt-6">
        <Space size="middle">
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            size="large"
            onClick={saveSettings}
          >
            Lưu cài đặt
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            size="large"
            onClick={handleResetSettings}
            danger
          >
            Reset mặc định
          </Button>
        </Space>
      </Card>
    </div>
  )
}

export default Settings
