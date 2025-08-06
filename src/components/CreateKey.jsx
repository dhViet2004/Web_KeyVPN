import { useState, useEffect } from 'react'
import { PlusOutlined, DeleteOutlined, FileTextOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, ReloadOutlined, RetweetOutlined, SwapOutlined } from '@ant-design/icons'
import { Button, Input, Select, Table, Radio, Space, Typography, Divider, Form, Tabs, Modal, App, Spin, Alert, Popconfirm } from 'antd'
import { useSettings } from '../hooks/useSettings'
import { useKeys } from '../hooks/useKeys'
import { keysAPI, accountsAPI } from '../services/api'

const { Title } = Typography
const { Option } = Select


const keyGroups = [
  { label: 'FBX', value: 'FBX' },
  { label: 'THX', value: 'THX' },
  { label: 'CTV', value: 'CTV' },
  { label: 'TEST', value: 'TEST' },
]

const keyTypeOptions = [
  { value: '3key', label: '3 key/1 tài khoản' },
  { value: '2key', label: '2 key/1 tài khoản' },
  { value: '1key', label: '1 key/1 tài khoản' },
]

const CreateKey = () => {
  const { message: messageApi } = App.useApp()
  const { settings } = useSettings()
  const [activeGroup, setActiveGroup] = useState('FBX')
  const { keys, createKeys, deleteKey, setKeys, fetchKeys } = useKeys(activeGroup)
  const [allKeys, setAllKeys] = useState([]) // Store all keys for filtering
  const [days, setDays] = useState(30)
  const [customDays, setCustomDays] = useState('')
  const [type, setType] = useState('2key')
  const [amount, setAmount] = useState(1)
  const [customer, setCustomer] = useState('')
  const [search, setSearch] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [selectedKeyGroup, setSelectedKeyGroup] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [filteredKeysForDelete, setFilteredKeysForDelete] = useState([])
  const [selectedKeysForDelete, setSelectedKeysForDelete] = useState([])
  const [selectAllForDelete, setSelectAllForDelete] = useState(false)
  const [form] = Form.useForm()

  // States for assign key modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [currentKeyForAssign, setCurrentKeyForAssign] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [justAssignedKey, setJustAssignedKey] = useState(false) // Track if key was just assigned
  const [tableKey, setTableKey] = useState(0) // Force table re-render

  // States for transfer key modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [currentKeyForTransfer, setCurrentKeyForTransfer] = useState(null)
  const [transferAccounts, setTransferAccounts] = useState([])
  const [loadingTransferAccounts, setLoadingTransferAccounts] = useState(false)
  const [selectedTransferAccountId, setSelectedTransferAccountId] = useState(null)

  // Fetch all keys for filtering purpose
  const fetchAllKeys = async () => {
    try {
      const allKeysData = []
      for (const group of keyGroups) {
        const response = await keysAPI.getKeys(group.value)
        
        if (response.success && response.data) {
          // Check if response.data has keys array
          if (Array.isArray(response.data.keys)) {
            allKeysData.push(...response.data.keys)
          } else if (Array.isArray(response.data)) {
            // Sometimes data might be directly an array
            allKeysData.push(...response.data)
          }
        }
      }
      setAllKeys(allKeysData)
    } catch {
      // Error handled silently
    }
  }

  // Load all keys when component mounts
  useEffect(() => {
    fetchAllKeys()
  }, [])

  // Refresh keys when the component becomes visible (e.g., when user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchAllKeys()
        fetchKeys(activeGroup)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activeGroup, fetchKeys])

  // Manual refresh function với deep refresh
  const handleRefresh = async () => {
    try {
      messageApi.info('Đang làm mới toàn bộ dữ liệu...');
      
      // Force refresh tất cả dữ liệu
      await Promise.all([
        fetchAllKeys(),
        fetchKeys(activeGroup)
      ]);
      
      // Force re-render table
      setTableKey(prev => prev + 1);
      
      messageApi.success('Đã cập nhật danh sách key và thông tin tài khoản!')
    } catch (error) {
      messageApi.error('Lỗi cập nhật: ' + (error.message || error))
    }
  }

  // Hàm force sync dữ liệu khi phát hiện inconsistency
  const handleDataSync = async () => {
    try {
      await Promise.all([
        fetchAllKeys(),
        fetchKeys(activeGroup)
      ]);
      
      // Force re-render tất cả components
      setTableKey(prev => prev + 1);
    } catch {
      // Error handled silently
    }
  }

  // Tạo key mới
  const handleCreate = async () => {
    try {
      const n = Math.max(1, parseInt(amount) || 1)
      const time = activeGroup === 'TEST' ? 2 : (customDays ? parseInt(customDays) : days)
      
      const keyData = {
        group: activeGroup,
        count: n,
        days: time,
        type,
        accountCount: type === '1key' ? 1 : type === '2key' ? 2 : type === '3key' ? 3 : 2, // Add accountCount based on key type
        customer: customer || '',
      }
      
      await createKeys(keyData)
      await fetchKeys(activeGroup)
      await fetchAllKeys()
      messageApi.success(`Đã tạo ${n} key mới cho nhóm ${activeGroup}!`)
      setIsModalOpen(false)
      
      // Reset form
      setDays(30)
      setCustomDays('')
      setType('2key')
      setAmount(1)
      setCustomer('')
      form.resetFields()
    } catch (error) {
      messageApi.error(`Lỗi tạo key: ${error.message}`)
    }
  }

  // Tạo key và xuất file txt
  const handleCreateAndExport = async () => {
    try {
      const n = Math.max(1, parseInt(amount) || 1)
      const time = activeGroup === 'TEST' ? 2 : (customDays ? parseInt(customDays) : days)
      
      const keyData = {
        group: activeGroup,
        count: n,
        days: time,
        type,
        accountCount: type === '1key' ? 1 : type === '2key' ? 2 : type === '3key' ? 3 : 2, // Add accountCount based on key type
        customer: customer || '',
      }
      
      const response = await createKeys(keyData)
      await fetchKeys(activeGroup)
      await fetchAllKeys()
      
      // Xuất file txt với keys mới được tạo
      const newKeys = response.data || []
      const fileName = `${activeGroup}${customDays || time}ngay.txt`
      const linkTemplate = settings.keyExport?.linkTemplate || 'link nhập key:'
      const content = newKeys.map(k => `${k.code} | ${linkTemplate}`).join('\n')
      const blob = new Blob([content], { type: 'text/plain' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      
      messageApi.success(`Đã tạo ${n} key mới và xuất file ${fileName}!`)
      setIsModalOpen(false)
      
      // Reset form
      setDays(30)
      setCustomDays('')
      setType('2key')
      setAmount(1)
      setCustomer('')
      form.resetFields()
    } catch (error) {
      messageApi.error(`Lỗi tạo key: ${error.message}`)
    }
  }

  // Mở modal tạo key
  const showCreateModal = () => {
    setIsModalOpen(true)
    form.setFieldsValue({
      days: activeGroup === 'TEST' ? 2 : days,
      customDays,
      type,
      amount,
      customer
    })
  }

  // Đóng modal
  const handleCancel = () => {
    setIsModalOpen(false)
  }

  // Mở modal lọc xóa
  const showFilterModal = () => {
    setIsFilterModalOpen(true)
    setSelectedKeyGroup('')
    setSelectedStatus('')
  }

  // Đóng modal lọc
  const handleFilterCancel = () => {
    setIsFilterModalOpen(false)
    setSelectedKeyGroup('')
    setSelectedStatus('')
    setFilteredKeysForDelete([])
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
  }

  // Xóa key theo bộ lọc
  const handleFilterDelete = async () => {
    try {
      // Xóa các key được chọn hoặc tất cả key được lọc
      const keysToDelete = selectedKeysForDelete.length > 0 ? selectedKeysForDelete : filteredKeysForDelete
      const deletedCount = keysToDelete.length
      
      // Gọi API để xóa từng key (backend sẽ tự động xóa các record liên quan trong account_keys)
      for (const key of keysToDelete) {
        try {
          await deleteKey(key.id)
        } catch {
          // Tiếp tục xóa các key khác
        }
      }
      
      // Refresh tất cả dữ liệu để đảm bảo đồng bộ
      await Promise.all([
        fetchKeys(activeGroup),
        fetchAllKeys()
      ]);
      
      messageApi.success(`Đã xóa ${deletedCount} key!`)
      setIsFilterModalOpen(false)
      setSelectedKeyGroup('')
      setSelectedStatus('')
      setFilteredKeysForDelete([])
      setSelectedKeysForDelete([])
      setSelectAllForDelete(false)
    } catch (error) {
      messageApi.error(`Lỗi xóa key: ${error.message}`)
      
      // Refresh dữ liệu ngay cả khi có lỗi để đảm bảo UI sync với database
      try {
        await Promise.all([
          fetchKeys(activeGroup),
          fetchAllKeys()
        ]);
      } catch {
        // Error handled silently
      }
    }
  }

  // Lọc key khi thay đổi nhóm key
  const handleKeyGroupChange = (group) => {
    const newGroup = selectedKeyGroup === group ? '' : group
    setSelectedKeyGroup(newGroup)
    setSelectedStatus('')
    setFilteredKeysForDelete([])
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
  }

  // Lọc key khi thay đổi trạng thái
  const handleStatusChange = (status) => {
    const newStatus = selectedStatus === status ? '' : status
    setSelectedStatus(newStatus)
    setSelectedKeysForDelete([])
    setSelectAllForDelete(false)
    
    if (selectedKeyGroup && newStatus) {
      let statusFilter = newStatus
      if (newStatus === 'hết hạn') {
        statusFilter = 'hết hạn'
      } else if (newStatus === 'còn hạn') {
        statusFilter = 'đang hoạt động'
      } else if (newStatus === 'chưa gán tài khoản') {
        statusFilter = 'chờ'
      }
      
      const filtered = allKeys.filter(k => 
        k.group === selectedKeyGroup && k.status === statusFilter
      )
      setFilteredKeysForDelete(filtered)
    } else {
      setFilteredKeysForDelete([])
    }
  }

  // Chọn key để xóa
  const handleSelectKeyForDelete = (keyId) => {
    const isSelected = selectedKeysForDelete.some(k => k.id === keyId)
    if (isSelected) {
      setSelectedKeysForDelete(selectedKeysForDelete.filter(k => k.id !== keyId))
    } else {
      const keyToAdd = filteredKeysForDelete.find(k => k.id === keyId)
      if (keyToAdd) {
        setSelectedKeysForDelete([...selectedKeysForDelete, keyToAdd])
      }
    }
  }

  // Chọn tất cả key để xóa
  const handleSelectAllForDelete = () => {
    if (selectAllForDelete) {
      setSelectedKeysForDelete([])
    } else {
      setSelectedKeysForDelete([...filteredKeysForDelete])
    }
    setSelectAllForDelete(!selectAllForDelete)
  }

  // Chọn/xóa key
  const handleSelect = id => setKeys(keys.map(k => k.id === id ? { ...k, selected: !k.selected } : k))
  const handleSelectAll = () => {
    setSelectAll(!selectAll)
    setKeys(keys.map(k => k.group === activeGroup ? { ...k, selected: !selectAll } : k))
  }
  const handleDeleteAccount = async id => {
    try {
      // Tìm key sẽ bị xóa để log thông tin
      const keyToDelete = keys.find(k => k.id === id);
      const keyCode = keyToDelete?.code || id;
      
      // Gọi API xóa key (backend sẽ tự động xóa các record liên quan trong account_keys)
      await deleteKey(id);
      
      // Refresh tất cả dữ liệu để đảm bảo đồng bộ
      await Promise.all([
        fetchKeys(activeGroup),
        fetchAllKeys()
      ]);
      
      messageApi.success(`Đã xóa key ${keyCode} thành công!`);
    } catch (error) {
      messageApi.error('Lỗi xóa key: ' + (error.message || error));
      
      // Refresh dữ liệu ngay cả khi có lỗi để đảm bảo UI sync với database
      try {
        await Promise.all([
          fetchKeys(activeGroup),
          fetchAllKeys()
        ]);
      } catch {
        // Error handled silently
      }
    }
  }

  // Functions for assign key modal
  const showAssignModal = async (key) => {
    // Kiểm tra trạng thái key trước khi mở modal
    if (key.status !== 'chờ') {
      messageApi.warning(`Key ${key.code} không thể gán vì đang ở trạng thái: ${key.status}. Chỉ có thể gán key có trạng thái "chờ".`)
      return
    }

    // Set key data first, then fetch accounts to ensure correct key type is used
    setCurrentKeyForAssign(key)
    setIsAssignModalOpen(true)
    setSelectedAccountId(null)
    setJustAssignedKey(false) // Reset success state when opening modal for new key
    
    // Always fetch fresh data to ensure accurate key counts
    // Không sử dụng cached data từ database query để đảm bảo số liệu chính xác
    await fetchAccountsWithSlots(key);
  }

  const handleAssignCancel = () => {
    setIsAssignModalOpen(false)
    setCurrentKeyForAssign(null)
    setSelectedAccountId(null)
    setAccounts([])
    setJustAssignedKey(false) // Reset assign success state
    setTableKey(0) // Reset table key
  }

  const fetchAccountsWithSlots = async (keyForAssign = null) => {
    try {
      setLoadingAccounts(true)
      const response = await accountsAPI.getAccounts()
      if (response.success && response.data && Array.isArray(response.data.accounts)) {
        // Filter accounts based on key type and dynamic slot limits
        // Use the passed key parameter if available, otherwise use the current state
        const keyToAssign = keyForAssign || currentKeyForAssign;
        
        // Try multiple possible field names for key type
        const keyType = keyToAssign?.key_type || 
                      keyToAssign?.type || 
                      keyToAssign?.keyType ||
                      keyToAssign?.key_type_name ||
                      keyToAssign?.type_name ||
                      '2key'; // fallback default
        
        const accountsWithSlots = response.data.accounts.filter(account => {
          // Map backend field names to frontend expected names
          // CHỈ đếm những key có is_active = true từ account_keys
          let currentKeys = account.key_count || account.current_key_count || 0;
          
          // If we have detailed assigned_keys data, count only active keys
          if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
            currentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
          }
          
          const currentMaxSlots = account.max_key_slots || account.max_keys || 3; // Backend might use 'max_keys'
          
          // First check: Make sure this account doesn't already have this specific ACTIVE key
          if (account.assigned_key_codes && typeof account.assigned_key_codes === 'string') {
            const assignedCodes = account.assigned_key_codes.split(', ').filter(code => code.trim());
            if (assignedCodes.includes(keyToAssign?.code)) {
              return false;
            }
          }
          
          // Additional check: If we have detailed assigned_keys data, check is_active status
          if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
            const hasActiveKey = account.assigned_keys.some(assignedKey => {
              // Check if this specific key is already actively assigned
              return (assignedKey.key_id === keyToAssign?.id || 
                     assignedKey.id === keyToAssign?.id ||
                     assignedKey.code === keyToAssign?.code) &&
                     assignedKey.is_active === true; // Only check ACTIVE assignments
            });
            if (hasActiveKey) {
              return false;
            }
            
            // Check for inactive assignments (can be reassigned)
            // account.assigned_keys.some() check removed to simplify logic
          }
          
          // Apply specific filtering logic based on key type
          if (keyType === '1key') {
            // 1key/tài khoản: CHỈ hiển thị tài khoản trống (0 keys) 
            // Sau khi gán sẽ có slot 1/1 và không thể gán thêm key nào
            const isEmpty = currentKeys === 0;
            return isEmpty;
            
          } else if (keyType === '2key') {
            // 2key/tài khoản: Hiển thị tài khoản trống (0 keys) HOẶC đã có key loại 2key với slot còn trống
            const isEmpty = currentKeys === 0;
            
            // Kiểm tra account có thể nhận thêm 2key không
            let canAccept2Key = false;
            
            if (isEmpty) {
              canAccept2Key = true; // Tài khoản trống luôn có thể nhận key
            } else if (currentKeys > 0 && currentKeys < 2) {
              // Account đã có key, kiểm tra key type và slot còn trống
              const dominantType = account.dominant_key_type;
              
              // CHỈ cho phép nếu:
              // 1. Dominant key type là 2key (tương thích)
              // 2. Max slots >= 2 (có đủ slot cho 2key)
              // 3. Current keys < 2 (còn slot trống)
              if (dominantType === '2key' && currentMaxSlots >= 2) {
                canAccept2Key = true;
              }
            }
            
            return canAccept2Key;
            
          } else if (keyType === '3key') {
            // 3key/tài khoản: Hiển thị tài khoản trống (0 keys) HOẶC đã có key loại 3key với còn slot
            // Tài khoản trống vẫn giữ slot 3/3 khi gán key đầu tiên
            
            if (currentKeys > 0) {
              const dominantKeyType = account.dominant_key_type;
              
              // Chỉ cho phép nếu tài khoản đã có key loại 3key và còn slot
              if (dominantKeyType === '3key' && currentKeys < 3) {
                return true;
              } else {
                return false;
              }
            }
            
            // Tài khoản chưa có key nào (currentKeys === 0), có thể gán 3key
            return true;
            
          } else {
            // Default fallback for unknown key types
            const hasSlots = currentKeys < 3;
            return hasSlots;
          }
        }).map(account => ({
          ...account,
          // Normalize field names from backend to frontend expected names
          current_key_count: account.key_count || account.current_key_count || 0,
          max_key_slots: account.max_keys || account.max_key_slots || 3,
          
          // Add computed fields for display with projected slots
          projected_max_slots: (() => {
            // Calculate projected max slots based on key type being assigned and current account state
            // Use active keys count like in the filter logic
            let currentKeys = account.key_count || account.current_key_count || 0;
            if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
              currentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
            }
            
            if (currentKeys === 0) {
              // Tài khoản trống: slot tối đa được xác định bởi key type sẽ gán
              if (keyType === '1key') {
                return 1; // 1key -> slot tối đa 1
              } else if (keyType === '2key') {
                return 2; // 2key -> slot tối đa 2  
              } else if (keyType === '3key') {
                return 3; // 3key -> slot tối đa 3
              } else {
                return 3; // Default
              }
            } else {
              // Tài khoản đã có key: sử dụng max_key_slots hiện tại từ backend
              // Fallback: parse từ assigned_keys nếu có format "x/y"
              if (account.assigned_keys && typeof account.assigned_keys === 'string' && account.assigned_keys.includes('/')) {
                const parts = account.assigned_keys.split('/');
                if (parts.length === 2 && !isNaN(parts[1])) {
                  return parseInt(parts[1]);
                }
              }
              return account.max_keys || account.max_key_slots || 3;
            }
          })(),
          available_slots: (() => {
            // Calculate active keys count (same logic as above)
            let actualCurrentKeys = account.key_count || account.current_key_count || 0;
            if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
              actualCurrentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
            }
            
            // Parse current key count from assigned_keys string format if available as fallback
            if (!account.assigned_keys || !Array.isArray(account.assigned_keys)) {
              if (account.assigned_keys && typeof account.assigned_keys === 'string' && account.assigned_keys.includes('/')) {
                const parts = account.assigned_keys.split('/');
                if (parts.length === 2 && !isNaN(parts[0])) {
                  actualCurrentKeys = parseInt(parts[0]);
                }
              }
            }
            
            // Calculate available slots based on current account state and key type being assigned
            if (keyType === '1key') {
              // 1key: Chỉ tài khoản trống, sau khi gán sẽ là 1/1 (full)
              return actualCurrentKeys === 0 ? 1 : 0;
              
            } else if (keyType === '2key') {
              // 2key: Tài khoản trống hoặc đã có 1x2key
              if (actualCurrentKeys === 0) {
                // Tài khoản trống, sau khi gán key đầu tiên sẽ là 1/2
                return 2;
              } else if (actualCurrentKeys === 1 && account.dominant_key_type === '2key') {
                // Đã có 1x2key, có thể gán thêm 1 key nữa
                return 1;
              } else {
                // Các trường hợp khác không thể gán 2key
                return 0;
              }
              
            } else if (keyType === '3key') {
              // 3key: Tài khoản trống hoặc đã có key loại 3key
              if (actualCurrentKeys === 0) {
                // Tài khoản trống, sau khi gán key đầu tiên sẽ là 1/3
                return 3;
              } else {
                const dominantKeyType = account.dominant_key_type;
                if (dominantKeyType === '3key') {
                  // Tài khoản có key loại 3key, tính slot còn lại
                  return Math.max(0, 3 - actualCurrentKeys);
                } else {
                  // Tài khoản có key loại khác, không thể gán 3key
                  return 0;
                }
              }
              
            } else {
              // Default fallback: parse max slots from assigned_keys or use default
              let maxSlots = 3;
              if (account.assigned_keys && typeof account.assigned_keys === 'string' && account.assigned_keys.includes('/')) {
                const parts = account.assigned_keys.split('/');
                if (parts.length === 2 && !isNaN(parts[1])) {
                  maxSlots = parseInt(parts[1]);
                }
              }
              return Math.max(0, maxSlots - actualCurrentKeys);
            }
          })(),
          can_accept_key_type: true // Already filtered for compatibility
        }))
        
        setAccounts(accountsWithSlots)
      } else {
        setAccounts([])
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
      messageApi.error('Lỗi tải danh sách tài khoản: ' + (error.message || error))
      setAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }

  const handleAssignKey = async () => {
    if (!selectedAccountId || !currentKeyForAssign) {
      messageApi.warning('Vui lòng chọn tài khoản để gán key!')
      return
    }

    try {
      const response = await accountsAPI.assignKey(selectedAccountId, currentKeyForAssign.id)
      
      if (response.success) {
        // Check if backend provided updated account info
        if (response.data && response.data.updatedAccount) {
          
          // Update accounts state with accurate backend data
          const updatedAccounts = accounts.map(account => {
            if (account.id === selectedAccountId) {
              const backendAccount = response.data.updatedAccount;
              const keyType = currentKeyForAssign?.key_type || currentKeyForAssign?.type || '2key';
              const projectedMax = keyType === '1key' ? 1 : keyType === '2key' ? 2 : keyType === '3key' ? 3 : (backendAccount.max_key_slots || 3);
              
              return {
                ...account,
                // Use backend provided values
                current_key_count: backendAccount.current_key_count,
                key_count: backendAccount.current_key_count, // Dual field for compatibility
                max_key_slots: backendAccount.max_key_slots,
                max_keys: backendAccount.max_key_slots, // Dual field for compatibility
                assigned_keys: backendAccount.assigned_keys,
                dominant_key_type: backendAccount.key_type_restriction, // Update dominant key type
                projected_max_slots: projectedMax,
                available_slots: Math.max(0, projectedMax - backendAccount.current_key_count)
              }
            }
            return account
          });
          
          setAccounts([...updatedAccounts]);
        } else {
          // Fallback: Refresh danh sách accounts từ server ngay lập tức
          await fetchAccountsWithSlots(currentKeyForAssign);
        }
        
        // Force update state và table re-render để trigger UI update
        setTableKey(prev => prev + 1) // Force table re-render
        
        // Hiển thị message thành công với thông tin slot change và reactivation
        let successMessage = `Đã gán key ${currentKeyForAssign.code} vào tài khoản thành công!`;
        if (response.message && response.message.includes('reactivated')) {
          successMessage = `Key ${currentKeyForAssign.code} đã được kích hoạt lại và gán cho tài khoản thành công!`;
        }
        if (response.data && response.data.slotChangeMessage) {
          successMessage += ` ${response.data.slotChangeMessage}`;
        }
        messageApi.success(successMessage)
        
        // Đánh dấu là vừa gán key thành công
        setJustAssignedKey(true)
        
        // Reset selected account để user có thể chọn tài khoản khác
        setSelectedAccountId(null)
        
        // Đợi một chút để database cập nhật, nhưng không cần quá lâu vì UI đã được cập nhật
        setTimeout(async () => {
          try {
            // Fetch lại dữ liệu từ server để đảm bảo đồng bộ với backend
            await fetchKeys(activeGroup)
            await fetchAllKeys()
            
            // Refresh accounts list để có dữ liệu chính xác nhất từ server
            await fetchAccountsWithSlots(currentKeyForAssign)
            
            // Force re-render sau khi refresh từ server
            setTableKey(prev => prev + 1)
            
          } catch (error) {
            console.error('Background refresh error:', error)
          }
        }, 500) // Giảm delay để cập nhật nhanh hơn
        
        // Không đóng modal để user có thể thấy thay đổi và tiếp tục gán key khác nếu muốn
        // handleAssignCancel()
      } else {
        // Xử lý các lỗi cụ thể từ server
        const errorMessage = response.message || 'Lỗi không xác định'
        
        // Log chi tiết để debug
        console.error('❌ Assign key failed:', {
          keyId: currentKeyForAssign.id,
          keyCode: currentKeyForAssign.code,
          keyType: currentKeyForAssign.key_type || currentKeyForAssign.type,
          accountId: selectedAccountId,
          response: response,
          error: errorMessage,
          timestamp: new Date().toISOString()
        });
        
        messageApi.error(`Lỗi gán key: ${errorMessage}`)
        
        // Refresh dữ liệu nếu có lỗi duplicate hoặc constraint để đảm bảo UI sync với database
        if (errorMessage.includes('already assigned') || errorMessage.includes('refresh') || errorMessage.includes('slot') || errorMessage.includes('database record conflict')) {
          try {
            await handleDataSync(); // Sử dụng function đồng bộ dữ liệu
          } catch (refreshError) {
            console.error('Failed to refresh data after error:', refreshError)
          }
        }
      }
    } catch (error) {
      console.error('Assign key error details:', error)
      
      // Xử lý các loại lỗi khác nhau
      let errorMessage = 'Lỗi không xác định'
      let shouldRefresh = false
      
      if (error.message.includes('Key not found or not available for assignment')) {
        errorMessage = `Key ${currentKeyForAssign.code} không tồn tại hoặc không khả dụng để gán. Key phải có trạng thái "chờ".`
        shouldRefresh = true
      } else if (error.message.includes('Account not found')) {
        errorMessage = 'Tài khoản không tồn tại.'
        shouldRefresh = true
      } else if (error.message.includes('Duplicate entry') || error.message.includes('already assigned') || error.message.includes('database record conflict')) {
        errorMessage = `Key ${currentKeyForAssign.code} có xung đột dữ liệu. Có thể key này đã từng được gán nhưng hiện đang inactive. Đang làm mới dữ liệu để thử kích hoạt lại...`
        shouldRefresh = true
        
        // Đối với lỗi constraint, thử refresh ngay lập tức để có thể reactivate
        setTimeout(async () => {
          try {
            await handleDataSync();
            messageApi.info('Dữ liệu đã được làm mới. Vui lòng thử gán key lại.');
          } catch (refreshError) {
            console.error('Failed to refresh after constraint error:', refreshError);
          }
        }, 1000);
        
      } else if (error.message.includes('maximum number of keys')) {
        errorMessage = 'Tài khoản đã đạt số lượng key tối đa.'
        shouldRefresh = true
      } else if (error.message.includes('maximum number of accounts')) {
        errorMessage = `Key ${currentKeyForAssign.code} đã đạt số lượng tài khoản tối đa.`
        shouldRefresh = true
      } else if (error.message.includes('slot')) {
        errorMessage = `Lỗi slot: ${error.message}. Dữ liệu đã được làm mới.`
        shouldRefresh = true
      } else {
        errorMessage = error.message || 'Lỗi gán key'
        // Nếu lỗi không xác định, cũng nên refresh để đảm bảo đồng bộ
        shouldRefresh = true
      }
      
      messageApi.error(errorMessage)
      
      // Refresh dữ liệu khi có lỗi để đảm bảo UI luôn sync với database
      if (shouldRefresh) {
        console.log('🔄 Refreshing data due to assign error...')
        try {
          await handleDataSync(); // Sử dụng function đồng bộ dữ liệu
          await fetchAccountsWithSlots(currentKeyForAssign); // Cũng refresh account list
          console.log('✅ Data refreshed after assign error')
        } catch (refreshError) {
          console.error('Failed to refresh data after error:', refreshError)
        }
      }
    }
  }

  // Functions for transfer key modal
  const showTransferModal = async (key) => {
    // Chỉ cho phép chuyển key đang hoạt động
    if (key.status !== 'đang hoạt động') {
      messageApi.warning(`Key ${key.code} không thể chuyển vì đang ở trạng thái: ${key.status}. Chỉ có thể chuyển key có trạng thái "đang hoạt động".`)
      return
    }

    setCurrentKeyForTransfer(key)
    setIsTransferModalOpen(true)
    setSelectedTransferAccountId(null)
    await fetchAccountsForTransfer(key) // ← Pass key parameter
  }

  const handleTransferCancel = () => {
    setIsTransferModalOpen(false)
    setCurrentKeyForTransfer(null)
    setSelectedTransferAccountId(null)
    setTransferAccounts([])
  }

  const fetchAccountsForTransfer = async (keyForTransfer = null) => {
    try {
      setLoadingTransferAccounts(true)
      const response = await accountsAPI.getAccounts()
      if (response.success && response.data && Array.isArray(response.data.accounts)) {
        
        // Filter accounts based on key type and dynamic slot limits
        // Use the passed key parameter if available, otherwise use the current state
        const keyToTransfer = keyForTransfer || currentKeyForTransfer;
        
        // Try multiple possible field names for key type
        const keyType = keyToTransfer?.key_type || 
                      keyToTransfer?.type || 
                      keyToTransfer?.keyType ||
                      keyToTransfer?.key_type_name ||
                      keyToTransfer?.type_name ||
                      '2key'; // fallback default
        
        const accountsWithSlots = response.data.accounts.filter(account => {
          // Map backend field names to frontend expected names
          // CHỈ đếm những key có is_active = true từ account_keys cho transfer
          let currentKeys = account.key_count || account.current_key_count || 0;
          
          // If we have detailed assigned_keys data, count only active keys
          if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
            currentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
          }
          
          const currentMaxSlots = account.max_key_slots || account.max_keys || 3; // Backend might use 'max_keys'
          
          // First check: Make sure this account doesn't already have this specific ACTIVE key
          if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
            const hasActiveKey = account.assigned_keys.some(assignedKey => {
              // Check if this specific key is already actively assigned
              return (assignedKey.key_id === keyToTransfer?.id || 
                     assignedKey.id === keyToTransfer?.id ||
                     assignedKey.code === keyToTransfer?.code) &&
                     assignedKey.is_active === true; // Only check ACTIVE assignments
            });
            if (hasActiveKey) {
              return false;
            }
          }
          
          // Additional check with assigned_key_codes string (should only contain active keys)
          if (account.assigned_key_codes && typeof account.assigned_key_codes === 'string') {
            const assignedCodes = account.assigned_key_codes.split(', ').filter(code => code.trim());
            if (assignedCodes.includes(keyToTransfer?.code)) {
              return false;
            }
          }
          
          // Apply specific filtering logic based on key type - EXACT SAME AS ASSIGN MODAL
          if (keyType === '1key') {
            // 1key/tài khoản: CHỈ hiển thị tài khoản trống (0 keys) 
            // Sau khi chuyển sẽ có slot 1/1 và không thể gán thêm key nào
            const isEmpty = currentKeys === 0;
            return isEmpty;
            
          } else if (keyType === '2key') {
            // 2key/tài khoản: Hiển thị tài khoản trống (0 keys) HOẶC đã có 1 key loại 2key (slot 1/2)
            // Tài khoản trống sẽ chuyển thành slot 2/2 khi chuyển key đầu tiên
            const isEmpty = currentKeys === 0;
            const hasOne2Key = currentKeys === 1 && account.dominant_key_type === '2key' && currentMaxSlots === 2;
            
            return isEmpty || hasOne2Key;
            
          } else if (keyType === '3key') {
            // 3key/tài khoản: Hiển thị tài khoản trống (0 keys) HOẶC đã có key loại 3key với còn slot
            // Tài khoản trống vẫn giữ slot 3/3 khi chuyển key đầu tiên
            
            if (currentKeys > 0) {
              const dominantKeyType = account.dominant_key_type;
              
              // Chỉ cho phép nếu tài khoản đã có key loại 3key và còn slot
              if (dominantKeyType === '3key' && currentKeys < 3) {
                return true;
              } else {
                return false;
              }
            }
            
            // Tài khoản trống, cho phép chuyển 3key
            return true;
            
          } else {
            // Default fallback for unknown key types
            const hasSlots = currentKeys < 3;
            return hasSlots;
          }
        }).map(account => ({
          ...account,
          // Normalize field names from backend to frontend expected names
          current_key_count: account.key_count || account.current_key_count || 0,
          max_key_slots: account.max_keys || account.max_key_slots || 3,
          
          // Add computed fields for display with projected slots
          projected_max_slots: (() => {
            // Calculate projected max slots based on key type being transferred and current account state
            // Use active keys count like in the filter logic
            let currentKeys = account.key_count || account.current_key_count || 0;
            if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
              currentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
            }
            
            if (currentKeys === 0) {
              // Tài khoản trống: slot tối đa được xác định bởi key type sẽ chuyển
              if (keyType === '1key') {
                return 1; // 1key -> slot tối đa 1
              } else if (keyType === '2key') {
                return 2; // 2key -> slot tối đa 2  
              } else if (keyType === '3key') {
                return 3; // 3key -> slot tối đa 3
              } else {
                return 3; // Default
              }
            } else {
              // Tài khoản đã có key: sử dụng max_key_slots hiện tại từ backend
              return account.max_keys || account.max_key_slots || 3;
            }
          })(),
          available_slots: (() => {
            // Use the same active keys calculation for consistency
            let availableCurrentKeys = account.key_count || account.current_key_count || 0;
            if (account.assigned_keys && Array.isArray(account.assigned_keys)) {
              availableCurrentKeys = account.assigned_keys.filter(key => key.is_active === true).length;
            }
            
            // Calculate available slots based on current account state and key type being transferred
            if (keyType === '1key') {
              // 1key: Chỉ tài khoản trống, sau khi chuyển sẽ là 1/1 (full)
              return availableCurrentKeys === 0 ? 1 : 0;
              
            } else if (keyType === '2key') {
              // 2key: Tài khoản trống hoặc đã có 1x2key
              if (availableCurrentKeys === 0) {
                // Tài khoản trống, sau khi chuyển key đầu tiên sẽ là 1/2
                return 2;
              } else if (availableCurrentKeys === 1 && account.dominant_key_type === '2key') {
                // Đã có 1x2key, có thể chuyển thêm 1 key nữa
                return 1;
              } else {
                // Các trường hợp khác không thể chuyển 2key
                return 0;
              }
              
            } else if (keyType === '3key') {
              // 3key: Tài khoản trống hoặc đã có key loại 3key
              if (availableCurrentKeys === 0) {
                // Tài khoản trống, sau khi chuyển key đầu tiên sẽ là 1/3
                return 3;
              } else {
                const dominantKeyType = account.dominant_key_type;
                if (dominantKeyType === '3key') {
                  // Tài khoản có key loại 3key, tính slot còn lại
                  return Math.max(0, 3 - availableCurrentKeys);
                } else {
                  // Tài khoản có key loại khác, không thể chuyển 3key
                  return 0;
                }
              }
              
            } else {
              // Default fallback
              const projectedMax = account.max_keys || account.max_key_slots || 3;
              return Math.max(0, projectedMax - availableCurrentKeys);
            }
          })(),
          can_accept_key_type: true // Already filtered for compatibility
        }))
        
        setTransferAccounts(accountsWithSlots)
      } else {
        setTransferAccounts([])
      }
    } catch (error) {
      console.error('Error fetching accounts for transfer:', error)
      messageApi.error('Lỗi tải danh sách tài khoản: ' + (error.message || error))
      setTransferAccounts([])
    } finally {
      setLoadingTransferAccounts(false)
    }
  }

  const handleTransferKey = async () => {
    if (!selectedTransferAccountId || !currentKeyForTransfer) {
      messageApi.warning('Vui lòng chọn tài khoản để chuyển key!')
      return
    }

    try {
      messageApi.info('Đang thực hiện chuyển key...')
      
      // Approach 1: Thử tìm tài khoản hiện tại thông qua việc lấy danh sách tài khoản và check keys
      const allAccountsResponse = await accountsAPI.getAccounts()
      let currentAccountId = null
      
      if (allAccountsResponse.success && allAccountsResponse.data && Array.isArray(allAccountsResponse.data.accounts)) {
        // Thử tìm tài khoản nào có key này
        for (const account of allAccountsResponse.data.accounts) {
          try {
            const accountKeysResponse = await accountsAPI.getAccountKeys(account.id)
            if (accountKeysResponse.success && accountKeysResponse.data && Array.isArray(accountKeysResponse.data)) {
              const hasKey = accountKeysResponse.data.some(key => key.id === currentKeyForTransfer.id || key.key_id === currentKeyForTransfer.id)
              if (hasKey) {
                currentAccountId = account.id
                break
              }
            }
          } catch (error) {
            // Bỏ qua lỗi và tiếp tục tìm
            console.log(`Cannot get keys for account ${account.id}:`, error.message)
          }
        }
      }
      
      if (currentAccountId && currentAccountId !== selectedTransferAccountId) {
        // Use unassign/assign approach since transferKey API may not be implemented
        try {
          // Unassign từ tài khoản cũ
          await accountsAPI.unassignKey(currentAccountId, currentKeyForTransfer.id)
          
          // Assign vào tài khoản mới
          const assignResponse = await accountsAPI.assignKey(selectedTransferAccountId, currentKeyForTransfer.id)
          if (assignResponse.success) {
            // Refresh dữ liệu sau khi unassign/assign thành công
            await Promise.all([
              fetchKeys(activeGroup),
              fetchAllKeys()
            ]);
            messageApi.success(`Đã chuyển key ${currentKeyForTransfer.code} sang tài khoản mới thành công!`)
            handleTransferCancel()
            return
          } else {
            throw new Error(assignResponse.message || 'Assign failed after unassign')
          }
        } catch (unassignAssignError) {
          throw new Error(`Không thể chuyển key: ${unassignAssignError.message}`)
        }
      } else if (currentAccountId === selectedTransferAccountId) {
        messageApi.warning(`Key ${currentKeyForTransfer.code} đã thuộc về tài khoản đích rồi!`)
        handleTransferCancel()
        return
      } else {
        // Không tìm được tài khoản hiện tại, có thể key chưa được gán
        messageApi.warning(`Không tìm được tài khoản hiện tại sở hữu key ${currentKeyForTransfer.code}. Key có thể chưa được gán cho tài khoản nào.`)
        
        // Thử gán trực tiếp
        try {
          const response = await accountsAPI.assignKey(selectedTransferAccountId, currentKeyForTransfer.id)
          
          if (response.success) {
            // Refresh dữ liệu sau khi gán trực tiếp thành công
            await Promise.all([
              fetchKeys(activeGroup),
              fetchAllKeys()
            ]);
            messageApi.success(`Đã gán key ${currentKeyForTransfer.code} vào tài khoản thành công!`)
            handleTransferCancel()
            return
          } else {
            throw new Error(response.message || 'Direct assign failed')
          }
        } catch (assignError) {
          throw new Error(`Không thể gán key: ${assignError.message}`)
        }
      }
      
    } catch (error) {
      console.error('Transfer key error details:', error)
      
      // Xử lý các loại lỗi khác nhau
      let errorMessage = 'Lỗi không xác định'
      
      if (error.message.includes('Key not found or not available for assignment')) {
        errorMessage = `Key ${currentKeyForTransfer.code} không khả dụng để chuyển. Key có thể đã được gán cho tài khoản khác hoặc đã hết hạn.`
      } else if (error.message.includes('Account not found') || error.message.includes('One or both accounts not found')) {
        errorMessage = 'Tài khoản nguồn hoặc đích không tồn tại.'
      } else if (error.message.includes('maximum number of keys')) {
        errorMessage = 'Tài khoản đích đã đạt số lượng key tối đa.'
      } else if (error.message.includes('not currently assigned')) {
        errorMessage = 'Key hiện không được gán cho tài khoản nguồn.'
      } else if (error.message.includes('already assigned')) {
        errorMessage = `Key ${currentKeyForTransfer.code} đã được gán cho tài khoản này.`
      } else {
        errorMessage = error.message || 'Lỗi chuyển key'
      }
      
      messageApi.error(errorMessage)
      
      // Refresh dữ liệu ngay cả khi có lỗi để đảm bảo UI sync với database
      try {
        await Promise.all([
          fetchKeys(activeGroup),
          fetchAllKeys()
        ]);
        console.log('🔄 Data refreshed after transfer error');
      } catch (refreshError) {
        console.error('Failed to refresh data after transfer error:', refreshError);
      }
      
      handleTransferCancel()
    }
  }

  // Xuất TXT
  const handleExport = () => {
    const selectedKeys = keys.filter(k => k.selected && k.group === activeGroup)
    if (selectedKeys.length === 0) {
      messageApi.warning('Vui lòng chọn ít nhất một key để xuất!')
      return
    }
    
    const fileName = `${activeGroup}${customDays || days}ngay.txt`
    const linkTemplate = settings.keyExport?.linkTemplate || 'link nhập key:'
    const content = selectedKeys.map(k => `${k.code} | ${linkTemplate}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    messageApi.success(`Đã xuất ${selectedKeys.length} key vào file ${fileName}!`)
  }

  // Map lại dữ liệu key để khớp với các cột bảng
  const mappedKeys = keys.map(k => ({
    ...k,
    group: k.group_code || k.group || activeGroup, // Fallback to activeGroup if no group info
    days: k.days_remaining || k.days_valid || k.days || 0,
    // Đảm bảo key_type luôn có giá trị
    key_type: k.key_type || k.type || k.keyType || '2key', // Map từ các field có thể có
    type: k.key_type || k.type || k.keyType || '2key', // Compatibility field
    accountCount: k.assigned_accounts ? 
      (typeof k.assigned_accounts === 'string' ? 
        JSON.parse(k.assigned_accounts).length : 
        k.assigned_accounts.length) : 
      (k.current_assignments || 0), // Use current_assignments from query or fallback to 0
    maxKeysPerAccount: k.max_keys_per_account || 2, // New field for display
    customer: k.customer_name || k.customer || '', // Fallback to empty string
    // Map account_details từ các field có thể có từ backend
    account_details: k.account_details || k.assigned_account_details || k.accounts || null
  }));

  // Tìm kiếm
  const filteredKeys = mappedKeys.filter(k => {
    const groupValue = k.group;
    if (groupValue !== activeGroup) return false;
    if (search === '') return true;
    if (['FBX', 'THX', 'CTV', 'TEST'].includes(search.toUpperCase())) return groupValue === search.toUpperCase();
    if (search === 'it') return k.days <= 3;
    return k.code.toLowerCase().includes(search.toLowerCase());
  })

  // Table columns
  const columns = [
    {
      title: <Input type="checkbox" checked={selectAll} onChange={handleSelectAll} />, dataIndex: 'selected', key: 'selected', width: 40,
      render: (_, record) => <Input type="checkbox" checked={record.selected} onChange={() => handleSelect(record.id)} />
    },
    { title: 'Mã key', dataIndex: 'code', key: 'code', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { title: 'Nhóm', dataIndex: 'group', key: 'group' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status' },
    { title: 'Ngày', dataIndex: 'days', key: 'days' },
    { 
      title: 'Danh sách tài khoản', 
      dataIndex: 'account_details', 
      key: 'account_details',
      width: 200,
      render: (account_details, record) => {
        
        try {
          let accounts = [];
          
          // Thử parse từ account_details trước (từ query JOIN)
          if (account_details && typeof account_details === 'string') {
            try {
              accounts = JSON.parse(account_details);
            } catch {
              // Có thể là string đơn giản, chuyển thành array
              accounts = [{ username: account_details }];
            }
          } else if (Array.isArray(account_details)) {
            accounts = account_details;
          } 
          // Fallback: thử từ các field khác
          else if (record.assigned_account_usernames) {
            // Nếu backend trả về danh sách username trực tiếp
            const usernames = typeof record.assigned_account_usernames === 'string' 
              ? record.assigned_account_usernames.split(',').map(u => u.trim())
              : record.assigned_account_usernames;
            accounts = usernames.map(username => ({ username }));
          }
          else if (record.assigned_accounts) {
            // Fallback cũ - chỉ có ID
            if (typeof record.assigned_accounts === 'string') {
              const assignedIds = JSON.parse(record.assigned_accounts || '[]');
              accounts = assignedIds.map(id => ({ account_id: id, username: `ID: ${id}` }));
            } else if (Array.isArray(record.assigned_accounts)) {
              accounts = record.assigned_accounts.map(id => ({ account_id: id, username: `ID: ${id}` }));
            }
          }
          
          if (accounts.length === 0) {
            return <span className="text-gray-400 italic">Chưa gán</span>;
          }
          
          // Display account usernames
          return (
            <div className="flex flex-wrap gap-1">
              {accounts.map((account, index) => (
                <span 
                  key={account.account_id || account.id || index}
                  className={`px-2 py-1 rounded text-xs ${
                    account.is_active === false || account.status === 'suspended'
                      ? 'bg-red-100 text-red-700' 
                      : account.is_active === true || account.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                  title={`${account.username || 'N/A'} | ID: ${account.account_id || account.id || 'N/A'} | Trạng thái: ${account.is_active ? 'Hoạt động' : 'Tạm dừng'}`}
                >
                  {account.username || `ID: ${account.account_id || account.id || 'N/A'}`}
                </span>
              ))}
            </div>
          );
        } catch (error) {
          console.error('Error parsing account_details:', error, 'Data:', account_details);
          return <span className="text-red-400 italic">Lỗi dữ liệu</span>;
        }
      }
    },
    { title: 'Khách hàng', dataIndex: 'customer', key: 'customer' },
    {
      title: 'Thao tác', key: 'actions', render: (_, record) => (
        <Space>
          {/* Chỉ hiển thị nút gán nếu key có trạng thái 'chờ' hoặc có thể gán được */}
          {(record.status === 'chờ' || record.status === 'đang hoạt động') && (
            <Button 
              icon={<RetweetOutlined />} 
              size="small" 
              type="primary"
              onClick={() => showAssignModal(record)}
              title="Gán key vào tài khoản"
              disabled={record.status !== 'chờ'} // Chỉ cho phép gán key có trạng thái 'chờ'
            >
              Gán
            </Button>
          )}
          
          {/* Nút chuyển key - chỉ hiển thị với key đang hoạt động */}
          {record.status === 'đang hoạt động' && (
            <Button 
              icon={<SwapOutlined />} 
              size="small" 
              type="default"
              onClick={() => showTransferModal(record)}
              title="Chuyển key sang tài khoản khác"
            >
              Chuyển
            </Button>
          )}
          
          <Popconfirm title="Xóa key này?" onConfirm={() => handleDeleteAccount(record.id)} okText="Xóa" cancelText="Hủy">
            <Button icon={<DeleteOutlined />} size="small" danger title="Xóa key" />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-2 sm:p-8 rounded-2xl shadow-md mt-2 sm:mt-6 transition-all">
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}><UnorderedListOutlined /> Key VPN</Title>
      <Divider />
      <Tabs 
        activeKey={activeGroup} 
        onChange={setActiveGroup} 
        type="card" 
        className="mb-4"
        items={keyGroups.map(g => ({
          key: g.value,
          label: g.label,
          children: (
            <>
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 mb-4 w-full">
                <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal} className="w-full md:w-auto">
                  Tạo key {g.label}
                </Button>
                <Button icon={<FileTextOutlined />} onClick={handleExport} className="w-full md:w-auto">Xuất TXT</Button>
                <Button icon={<DeleteOutlined />} danger onClick={showFilterModal} className="w-full md:w-auto">Xóa key</Button>
                <Button icon={<ReloadOutlined />} onClick={handleRefresh} className="w-full md:w-auto">Làm mới</Button>
              </div>
              <Divider />
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 mb-4 w-full">
                <Input prefix={<SearchOutlined />} placeholder="Tìm kiếm key, FBX, THX, CTV, TEST, it..." className="w-full md:w-80" value={search} onChange={e => setSearch(e.target.value)} />
                <Button onClick={handleSelectAll} className="w-full md:w-auto">{selectAll ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</Button>
              </div>
              <div className="overflow-x-auto rounded-xl shadow-sm">
                <Table
                  key={tableKey} // Force re-render when tableKey changes
                  columns={columns}
                  dataSource={filteredKeys}
                  rowKey="id"
                  pagination={{ pageSize: 8 }}
                  scroll={{ x: 1000 }}
                  bordered
                  size="middle"
                  style={{ borderRadius: 12, minWidth: 800 }}
                />
              </div>
            </>
          )
        }))}
      />

      {/* Modal tạo key */}
      <Modal
        title={`Tạo Key ${activeGroup}`}
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4">
            <Form.Item label="Thời gian key" className="mb-0 md:col-span-2">
              <Space wrap>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 30} 
                  onChange={() => { setDays(30); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  30 ngày
                </Radio>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 15} 
                  onChange={() => { setDays(15); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  15 ngày
                </Radio>
                <Radio 
                  checked={activeGroup !== 'TEST' && days === 5} 
                  onChange={() => { setDays(5); setCustomDays('') }} 
                  disabled={activeGroup === 'TEST'}
                >
                  5 ngày
                </Radio>
                <Input 
                  type="number" 
                  min={1} 
                  style={{ width: 80 }} 
                  placeholder="Tùy chỉnh" 
                  value={customDays} 
                  onChange={e => setCustomDays(e.target.value)} 
                  disabled={activeGroup === 'TEST'} 
                />
                {activeGroup === 'TEST' && <span className="text-xs text-gray-500">(2 ngày cố định)</span>}
              </Space>
            </Form.Item>
            
            <Form.Item label="Loại key" className="mb-0">
              <Select value={type} onChange={v => setType(v)} style={{ width: 160 }}>
                {keyTypeOptions.map(opt => <Option key={opt.value} value={opt.value}>{opt.label}</Option>)}
              </Select>
            </Form.Item>
            
            <Form.Item label="Số lượng key" className="mb-0">
              <Input 
                type="number" 
                min={1} 
                className="w-full" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
              />
            </Form.Item>
            
            <Form.Item label={<span><UserOutlined /> Thông tin khách hàng (tùy chọn)</span>} className="mb-0 md:col-span-2">
              <Input 
                placeholder="Tên, link Facebook..." 
                className="w-full" 
                value={customer} 
                onChange={e => setCustomer(e.target.value)} 
              />
            </Form.Item>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button onClick={handleCancel}>
              Hủy
            </Button>
            <Button type="default" icon={<FileTextOutlined />} onClick={handleCreateAndExport}>
              Tạo key và xuất TXT
            </Button>
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit">
              Tạo key
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal lọc xóa key */}
      <Modal
        title="Lọc và Xóa Key"
        open={isFilterModalOpen}
        onCancel={handleFilterCancel}
        footer={null}
        width={600}
      >
        <div className="space-y-6">
          {/* Chọn dạng key */}
          <div>
            <h4 className="text-base font-semibold mb-3">Chọn dạng key:</h4>
            <div className="grid grid-cols-2 gap-3">
              {keyGroups.map(group => (
                <Button
                  key={group.value}
                  type={selectedKeyGroup === group.value ? 'primary' : 'default'}
                  onClick={() => handleKeyGroupChange(group.value)}
                  className="h-10"
                >
                  {group.label}
                </Button>
              ))}
            </div>
            {selectedKeyGroup && (
              <p className="text-sm text-gray-500 mt-2">Đã chọn: {selectedKeyGroup}</p>
            )}
          </div>

          {/* Chọn trạng thái (chỉ hiện khi đã chọn dạng key) */}
          {selectedKeyGroup && (
            <div>
              <h4 className="text-base font-semibold mb-3">Chọn trạng thái:</h4>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { value: 'hết hạn', label: 'Hết hạn', color: 'red' },
                  { value: 'còn hạn', label: 'Còn hạn', color: 'green' },
                  { value: 'chưa gán tài khoản', label: 'Chưa gán tài khoản', color: 'blue' }
                ].map(status => (
                  <Button
                    key={status.value}
                    type={selectedStatus === status.value ? 'primary' : 'default'}
                    onClick={() => handleStatusChange(status.value)}
                    className="h-10 text-left justify-start"
                    style={{
                      borderColor: selectedStatus === status.value ? undefined : status.color,
                      color: selectedStatus === status.value ? undefined : status.color
                    }}
                  >
                    {status.label}
                  </Button>
                ))}
              </div>
              {selectedStatus && (
                <p className="text-sm text-gray-500 mt-2">Đã chọn: {selectedStatus}</p>
              )}
            </div>
          )}

          {/* Hiển thị danh sách key được lọc */}
          {filteredKeysForDelete.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-base font-semibold">
                  Danh sách key ({filteredKeysForDelete.length} key):
                </h4>
                <div className="flex gap-2">
                  <Button 
                    size="small" 
                    onClick={handleSelectAllForDelete}
                    type={selectAllForDelete ? 'primary' : 'default'}
                  >
                    {selectAllForDelete ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </Button>
                </div>
              </div>
              
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={filteredKeysForDelete}
                  columns={[
                    {
                      title: (
                        <input
                          type="checkbox"
                          checked={selectAllForDelete}
                          onChange={handleSelectAllForDelete}
                        />
                      ),
                      width: 50,
                      render: (_, record) => (
                        <input
                          type="checkbox"
                          checked={selectedKeysForDelete.some(k => k.id === record.id)}
                          onChange={() => handleSelectKeyForDelete(record.id)}
                        />
                      )
                    },
                    {
                      title: 'Mã key',
                      dataIndex: 'code',
                      render: (text) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '12px' }}>
                          {text}
                        </span>
                      )
                    },
                    {
                      title: 'Trạng thái',
                      dataIndex: 'status',
                      render: (status) => (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status === 'hết hạn' ? 'bg-red-100 text-red-600' :
                          status === 'đang hoạt động' ? 'bg-green-100 text-green-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {status}
                        </span>
                      )
                    },
                    {
                      title: 'Ngày',
                      dataIndex: 'days',
                      width: 60
                    },
                    {
                      title: 'Khách hàng',
                      dataIndex: 'customer',
                      render: (text) => text || '-'
                    }
                  ]}
                />
              </div>
              
              {selectedKeysForDelete.length > 0 && (
                <p className="text-sm text-blue-600 mt-2">
                  Đã chọn {selectedKeysForDelete.length} key để xóa
                </p>
              )}
            </div>
          )}

          {/* Thông tin xem trước */}
          {selectedKeyGroup && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold mb-2">Xem trước:</h5>
              {filteredKeysForDelete.length > 0 ? (
                <div>
                  <p className="text-sm text-gray-600">
                    {selectedKeysForDelete.length > 0 ? (
                      <>Sẽ xóa <strong>{selectedKeysForDelete.length}</strong> key đã chọn</>
                    ) : (
                      <>Sẽ xóa <strong>tất cả {filteredKeysForDelete.length}</strong> key <strong>{selectedKeyGroup}</strong> có trạng thái <strong>{selectedStatus}</strong></>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Sẽ xóa tất cả key <strong>{selectedKeyGroup}</strong>
                  {selectedStatus && (
                    <span> có trạng thái <strong>{selectedStatus}</strong></span>
                  )}
                </p>
              )}
              <p className="text-sm text-red-500 mt-2">
                ⚠️ Hành động này không thể hoàn tác!
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button onClick={handleFilterCancel}>
              Hủy
            </Button>
            <Button 
              type="primary" 
              danger 
              icon={<DeleteOutlined />}
              onClick={handleFilterDelete}
              disabled={!selectedKeyGroup || (filteredKeysForDelete.length === 0 && selectedKeysForDelete.length === 0)}
            >
              {selectedKeysForDelete.length > 0 
                ? `Xóa ${selectedKeysForDelete.length} key đã chọn`
                : filteredKeysForDelete.length > 0
                ? `Xóa tất cả ${filteredKeysForDelete.length} key`
                : 'Xóa key'
              }
            </Button>
          </div>
        </div>
      </Modal>

                  {/* Modal gán key vào tài khoản */}
      <Modal
        title={`Gán Key vào Tài khoản`}
        open={isAssignModalOpen}
        onCancel={handleAssignCancel}
        footer={null}
        width={800}
      >
        <div className="space-y-4">
          {currentKeyForAssign && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Thông tin key:</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Mã key:</span> <span className="font-mono font-bold">{currentKeyForAssign.code}</span></div>
                <div><span className="font-medium">Nhóm:</span> {currentKeyForAssign.group}</div>
                <div><span className="font-medium">Loại key:</span> 
                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                    {currentKeyForAssign.key_type || currentKeyForAssign.type || '2key'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Trạng thái:</span> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    currentKeyForAssign.status === 'chờ' ? 'bg-blue-100 text-blue-600' :
                    currentKeyForAssign.status === 'đang hoạt động' ? 'bg-green-100 text-green-600' :
                    currentKeyForAssign.status === 'hết hạn' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {currentKeyForAssign.status}
                  </span>
                </div>
                <div><span className="font-medium">Số ngày:</span> {currentKeyForAssign.days}</div>
                <div><span className="font-medium">Khách hàng:</span> {currentKeyForAssign.customer || 'Không có'}</div>
              </div>
              
              {currentKeyForAssign.status !== 'chờ' && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-700">
                    <strong>⚠️ Lưu ý:</strong> Key này có trạng thái "{currentKeyForAssign.status}" và có thể không thể gán được. 
                    Chỉ những key có trạng thái "chờ" mới có thể gán vào tài khoản.
                  </p>
                </div>
              )}
              
              {justAssignedKey && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-700">
                    <strong>✅ Thành công!</strong> Key đã được gán thành công. Danh sách tài khoản bên dưới đã được cập nhật với số lượng key mới nhất.
                    Bạn có thể tiếp tục gán key khác hoặc đóng modal này.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-3">Chọn tài khoản có slot trống:</h4>
            {loadingAccounts ? (
              <div className="text-center py-8">
                <Spin size="large" />
                <p className="mt-2 text-gray-500">Đang tải danh sách tài khoản...</p>
              </div>
            ) : accounts.length === 0 ? (
              <Alert
                message="Không có tài khoản nào có slot trống"
                description="Tất cả tài khoản đã đạt số key tối đa hoặc không có tài khoản nào."
                type="info"
                showIcon
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table
                  key={tableKey} // Force re-render when tableKey changes
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={accounts}
                  rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedAccountId ? [selectedAccountId] : [],
                    onChange: (selectedRowKeys) => {
                      setSelectedAccountId(selectedRowKeys[0] || null)
                    }
                  }}
                  columns={[
                    {
                      title: 'Username',
                      dataIndex: 'username',
                      render: (text) => (
                        <span className="font-mono font-semibold">{text}</span>
                      )
                    },
                    {
                      title: 'Slot key',
                      render: (_, record) => {
                        // Use projected slots for the key type being assigned
                        const projectedMaxSlots = record.projected_max_slots || 3;
                        const currentKeys = record.current_key_count || 0;
                        const availableSlots = Math.max(0, projectedMaxSlots - currentKeys);
                        const keyTypeRestrictions = record.key_type_restrictions;
                        
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${
                                availableSlots === 0 ? 'text-red-600 font-bold' :
                                availableSlots === 1 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {currentKeys}/{projectedMaxSlots}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({availableSlots} trống)
                              </span>
                            </div>
                            
                            {/* Show slot change info */}
                            {projectedMaxSlots !== (record.max_key_slots || 3) && (
                              <div className="text-xs">
                                {projectedMaxSlots < (record.max_key_slots || 3) ? (
                                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                                    📉 Slot sẽ thay đổi: {record.max_key_slots || 3} → {projectedMaxSlots}
                                  </span>
                                ) : (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                    📈 Slot sẽ tăng: {record.max_key_slots || 3} → {projectedMaxSlots}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {/* Show when slot remains the same */}
                            {projectedMaxSlots === (record.max_key_slots || 3) && projectedMaxSlots === 3 && (
                              <div className="text-xs">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  ✅ Slot giữ nguyên: {projectedMaxSlots}
                                </span>
                              </div>
                            )}
                            
                            {keyTypeRestrictions && keyTypeRestrictions !== '' && (
                              <div className="text-xs">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  🔒 Chỉ: {keyTypeRestrictions}
                                </span>
                              </div>
                            )}
                            
                            {availableSlots === 1 && (
                              <span className="text-xs text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded font-medium">
                                ⚠️ Slot cuối cùng
                              </span>
                            )}
                            
                            {availableSlots === 0 && (
                              <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-medium">
                                ❌ Đã đầy
                              </span>
                            )}
                          </div>
                        );
                      }
                    },
                    {
                      title: 'Trạng thái',
                      dataIndex: 'status',
                      render: (status) => (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status === 'active' ? 'bg-green-100 text-green-600' :
                          status === 'suspended' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {status === 'active' ? 'Hoạt động' : 
                           status === 'suspended' ? 'Tạm khóa' : status}
                        </span>
                      )
                    },
                    {
                      title: 'Hạn sử dụng',
                      dataIndex: 'expires_at',
                      render: (date) => {
                        if (!date) return '-'
                        const expireDate = new Date(date)
                        const now = new Date()
                        const isExpired = expireDate < now
                        return (
                          <span className={isExpired ? 'text-red-500' : 'text-green-600'}>
                            {expireDate.toLocaleDateString('vi-VN')}
                          </span>
                        )
                      }
                    }
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button onClick={handleAssignCancel}>
              Đóng
            </Button>
            <Button 
              onClick={async () => {
                messageApi.info('Đang làm mới danh sách tài khoản...')
                await fetchAccountsWithSlots(currentKeyForAssign)
                messageApi.success('Đã cập nhật danh sách tài khoản!')
              }}
              disabled={loadingAccounts}
              icon={<ReloadOutlined />}
              loading={loadingAccounts}
            >
              Làm mới danh sách
            </Button>
            <Button 
              type="primary"
              onClick={handleAssignKey}
              disabled={!selectedAccountId || loadingAccounts || (currentKeyForAssign && currentKeyForAssign.status !== 'chờ')}
              icon={<RetweetOutlined />}
            >
              {currentKeyForAssign && currentKeyForAssign.status !== 'chờ' 
                ? `Không thể gán (${currentKeyForAssign.status})`
                : 'Gán Key vào Tài khoản'
              }
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal chuyển key sang tài khoản khác */}
      <Modal
        title={`Chuyển Key sang Tài khoản Khác`}
        open={isTransferModalOpen}
        onCancel={handleTransferCancel}
        footer={null}
        width={800}
      >
        <div className="space-y-4">
          {currentKeyForTransfer && (
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Thông tin key cần chuyển:</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Mã key:</span> <span className="font-mono font-bold">{currentKeyForTransfer.code}</span></div>
                <div><span className="font-medium">Nhóm:</span> {currentKeyForTransfer.group}</div>
                <div><span className="font-medium">Loại key:</span> 
                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                    {currentKeyForTransfer.key_type || currentKeyForTransfer.type || '2key'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Trạng thái:</span> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    currentKeyForTransfer.status === 'chờ' ? 'bg-blue-100 text-blue-600' :
                    currentKeyForTransfer.status === 'đang hoạt động' ? 'bg-green-100 text-green-600' :
                    currentKeyForTransfer.status === 'hết hạn' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {currentKeyForTransfer.status}
                  </span>
                </div>
                <div><span className="font-medium">Số ngày:</span> {currentKeyForTransfer.days}</div>
                <div><span className="font-medium">Khách hàng:</span> {currentKeyForTransfer.customer || 'Không có'}</div>
              </div>
              
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>🎯 Hệ thống thông minh:</strong> Key này sẽ được chuyển từ tài khoản hiện tại sang tài khoản phù hợp.
                  Danh sách bên dưới chỉ hiển thị những tài khoản tương thích với loại key này.
                </p>
              </div>
              
              {/* Smart filtering explanation */}
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
                <p className="text-sm text-green-700">
                  <strong>✨ Logic lọc thông minh:</strong>
                  {(() => {
                    const keyType = currentKeyForTransfer.key_type || currentKeyForTransfer.type || '2key';
                    if (keyType === '1key') {
                      return ' CHỈ hiển thị tài khoản trống hoàn toàn. Sau khi chuyển, tài khoản sẽ bị khóa ở 1 slot duy nhất.';
                    } else if (keyType === '2key') {
                      return ' Hiển thị tài khoản trống hoặc đã có 1 key loại 2key. Tài khoản trống sẽ có tối đa 2 slots.';
                    } else if (keyType === '3key') {
                      return ' Hiển thị tài khoản trống hoặc đã có key loại 3key với slot trống. Tài khoản sẽ giữ nguyên 3 slots tối đa.';
                    } else {
                      return ' Hiển thị tài khoản có slot khả dụng.';
                    }
                  })()}
                </p>
              </div>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-3">Chọn tài khoản đích có slot trống:</h4>
            {loadingTransferAccounts ? (
              <div className="text-center py-8">
                <Spin size="large" />
                <p className="mt-2 text-gray-500">Đang tải danh sách tài khoản...</p>
              </div>
            ) : transferAccounts.length === 0 ? (
              <Alert
                message={`Không có tài khoản phù hợp cho key loại ${currentKeyForTransfer?.key_type || currentKeyForTransfer?.type || '2key'}`}
                description={(() => {
                  const keyType = currentKeyForTransfer?.key_type || currentKeyForTransfer?.type || '2key';
                  if (keyType === '1key') {
                    return 'Key loại 1key/tài khoản cần tài khoản hoàn toàn trống (0 keys). Tất cả tài khoản hiện tại đã có key hoặc không tương thích.';
                  } else if (keyType === '2key') {
                    return 'Key loại 2key/tài khoản cần tài khoản trống hoặc đã có 1 key loại 2key. Không tìm thấy tài khoản phù hợp.';
                  } else if (keyType === '3key') {
                    return 'Key loại 3key/tài khoản cần tài khoản trống hoặc đã có key loại 3key với slot trống. Không tìm thấy tài khoản phù hợp.';
                  } else {
                    return 'Tất cả tài khoản đã đạt số key tối đa hoặc không tương thích với loại key này.';
                  }
                })()}
                type="warning"
                showIcon
                action={
                  <Button size="small" onClick={() => fetchAccountsForTransfer()}>
                    🔄 Làm mới
                  </Button>
                }
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={transferAccounts}
                  rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedTransferAccountId ? [selectedTransferAccountId] : [],
                    onChange: (selectedRowKeys) => {
                      setSelectedTransferAccountId(selectedRowKeys[0] || null)
                    }
                  }}
                  columns={[
                    {
                      title: 'Username',
                      dataIndex: 'username',
                      render: (text) => (
                        <span className="font-mono font-semibold">{text}</span>
                      )
                    },
                    {
                      title: 'Slot key',
                      render: (_, record) => {
                        // Use projected slots for the key type being transferred
                        const projectedMaxSlots = record.projected_max_slots || 3;
                        const currentKeys = record.current_key_count || 0;
                        const availableSlots = Math.max(0, projectedMaxSlots - currentKeys);
                        const keyTypeRestrictions = record.key_type_restrictions;
                        
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${
                                availableSlots === 0 ? 'text-red-600 font-bold' :
                                availableSlots === 1 ? 'text-orange-600' :
                                'text-green-600'
                              }`}>
                                {currentKeys}/{projectedMaxSlots}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({availableSlots} trống)
                              </span>
                            </div>
                            
                            {/* Show slot change info */}
                            {projectedMaxSlots !== (record.max_key_slots || 3) && (
                              <div className="text-xs">
                                {projectedMaxSlots < (record.max_key_slots || 3) ? (
                                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                                    📉 Slot sẽ thay đổi: {record.max_key_slots || 3} → {projectedMaxSlots}
                                  </span>
                                ) : (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                    📈 Slot sẽ tăng: {record.max_key_slots || 3} → {projectedMaxSlots}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {/* Show when slot remains the same */}
                            {projectedMaxSlots === (record.max_key_slots || 3) && projectedMaxSlots === 3 && (
                              <div className="text-xs">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  ✅ Slot giữ nguyên: {projectedMaxSlots}
                                </span>
                              </div>
                            )}
                            
                            {keyTypeRestrictions && keyTypeRestrictions !== '' && (
                              <div className="text-xs">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  🔒 Chỉ: {keyTypeRestrictions}
                                </span>
                              </div>
                            )}
                            
                            {availableSlots === 1 && (
                              <span className="text-xs text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded font-medium">
                                ⚠️ Slot cuối cùng
                              </span>
                            )}
                            
                            {availableSlots === 0 && (
                              <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-medium">
                                ❌ Đã đầy
                              </span>
                            )}
                          </div>
                        );
                      }
                    },
                    {
                      title: 'Trạng thái',
                      dataIndex: 'status',
                      render: (status) => (
                        <span className={`px-2 py-1 rounded text-xs ${
                          status === 'active' ? 'bg-green-100 text-green-600' :
                          status === 'suspended' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {status === 'active' ? 'Hoạt động' : 
                           status === 'suspended' ? 'Tạm khóa' : status}
                        </span>
                      )
                    },
                    {
                      title: 'Hạn sử dụng',
                      dataIndex: 'expires_at',
                      render: (date) => {
                        if (!date) return '-'
                        const expireDate = new Date(date)
                        const now = new Date()
                        const isExpired = expireDate < now
                        return (
                          <span className={isExpired ? 'text-red-500' : 'text-green-600'}>
                            {expireDate.toLocaleDateString('vi-VN')}
                          </span>
                        )
                      }
                    }
                  ]}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button onClick={handleTransferCancel}>
              Hủy
            </Button>
            <Button 
              type="primary"
              onClick={handleTransferKey}
              disabled={!selectedTransferAccountId || loadingTransferAccounts}
              icon={<SwapOutlined />}
              style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}
            >
              Chuyển Key sang Tài khoản Đích
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default CreateKey 