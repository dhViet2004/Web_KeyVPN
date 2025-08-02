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
        console.log(`🔍 Fetching keys for group: ${group.value}`)
        const response = await keysAPI.getKeys(group.value)
        console.log(`📊 Response for ${group.value}:`, response)
        
        if (response.success && response.data) {
          // Check if response.data has keys array
          if (Array.isArray(response.data.keys)) {
            console.log(`✅ Found ${response.data.keys.length} keys for ${group.value}`)
            allKeysData.push(...response.data.keys)
          } else if (Array.isArray(response.data)) {
            // Sometimes data might be directly an array
            console.log(`✅ Found ${response.data.length} keys for ${group.value} (direct array)`)
            allKeysData.push(...response.data)
          } else {
            console.log(`⚠️ Unexpected data structure for ${group.value}:`, response.data)
          }
        } else {
          console.log(`⚠️ No keys found for ${group.value}:`, response)
        }
      }
      console.log(`🎯 Total keys fetched: ${allKeysData.length}`)
      setAllKeys(allKeysData)
    } catch (error) {
      console.error('❌ Error fetching all keys:', error)
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

  // Manual refresh function
  const handleRefresh = async () => {
    try {
      await fetchAllKeys()
      await fetchKeys(activeGroup)
      messageApi.success('Đã cập nhật danh sách key!')
    } catch (error) {
      messageApi.error('Lỗi cập nhật: ' + (error.message || error))
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
      
      // Gọi API để xóa từng key
      for (const key of keysToDelete) {
        await deleteKey(key.id)
      }
      
      // Refresh both current group keys and all keys
      await fetchKeys(activeGroup)
      await fetchAllKeys()
      
      messageApi.success(`Đã xóa ${deletedCount} key!`)
      setIsFilterModalOpen(false)
      setSelectedKeyGroup('')
      setSelectedStatus('')
      setFilteredKeysForDelete([])
      setSelectedKeysForDelete([])
      setSelectAllForDelete(false)
    } catch (error) {
      messageApi.error(`Lỗi xóa key: ${error.message}`)
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
      await deleteKey(id);
      await fetchKeys(activeGroup);
      await fetchAllKeys();
      messageApi.success('Đã xóa key thành công!');
    } catch (error) {
      messageApi.error('Lỗi xóa key: ' + (error.message || error));
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
        console.log('🔍 Raw accounts data from API:', response.data.accounts.slice(0, 2)) // Debug log
        
        // Filter accounts based on key type and dynamic slot limits
        // Use the passed key parameter if available, otherwise use the current state
        const keyToAssign = keyForAssign || currentKeyForAssign;
        const keyType = keyToAssign?.key_type || keyToAssign?.type || '2key';
        
        console.log('🔍 Key type for filtering accounts:', keyType, 'Key data:', keyToAssign)
        
        const accountsWithSlots = response.data.accounts.filter(account => {
          // Map backend field names to frontend expected names
          const currentKeys = account.key_count || account.current_key_count || 0; // Backend uses 'key_count'
          const currentMaxSlots = account.max_key_slots || account.max_keys || 3; // Backend might use 'max_keys'
          
          console.log(`🔍 Account ${account.username}: key_count=${account.key_count}, current_key_count=${account.current_key_count}, max_keys=${account.max_keys}, dominant_key_type=${account.dominant_key_type}`)
          
          // Check key type restrictions first
          let isCompatible = true;
          if (account.key_type_restrictions && account.key_type_restrictions !== '') {
            isCompatible = account.key_type_restrictions === keyType;
          }
          
          if (!isCompatible) {
            console.log(`❌ Account ${account.username} not compatible with ${keyType} (restricted to ${account.key_type_restrictions})`);
            return false;
          }
          
          // Apply specific filtering logic based on key type
          if (keyType === '1key') {
            // 1key/tài khoản: Chỉ hiển thị tài khoản trống (0/3 slot)
            const isEmpty = currentKeys === 0;
            if (!isEmpty) {
              console.log(`❌ Account ${account.username} has ${currentKeys} keys, not suitable for 1key (needs empty account)`);
            }
            return isEmpty;
            
          } else if (keyType === '2key') {
            // 2key/tài khoản: Hiển thị tài khoản trống (0/3) hoặc đã có 1 key loại 2key
            const isEmpty = currentKeys === 0;
            const hasOne2Key = currentKeys === 1 && (account.dominant_key_type === '2key' || currentMaxSlots === 2);
            
            if (!isEmpty && !hasOne2Key) {
              console.log(`❌ Account ${account.username} has ${currentKeys} keys (type: ${account.dominant_key_type}), not suitable for 2key`);
            }
            return isEmpty || hasOne2Key;
            
          } else if (keyType === '3key') {
            // 3key/tài khoản: Chỉ hiển thị tài khoản chưa gán key HOẶC đã gán key loại 3key
            // Không được hiển thị tài khoản đã gán key loại 2key để tránh xung đột slot
            const projectedMaxSlots = 3; // 3key luôn có slot = 3
            const hasSlots = currentKeys < projectedMaxSlots;
            
            // Kiểm tra loại key dominat nếu tài khoản đã có key
            if (currentKeys > 0) {
              const dominantKeyType = account.dominant_key_type;
              
              // Nếu tài khoản đã có key loại 2key, không cho phép gán 3key
              if (dominantKeyType === '2key') {
                console.log(`❌ Account ${account.username} has ${currentKeys} keys of type ${dominantKeyType}, cannot assign 3key to avoid slot conflict`);
                return false;
              }
              
              // Nếu tài khoản đã có key loại 1key, không cho phép gán 3key  
              if (dominantKeyType === '1key') {
                console.log(`❌ Account ${account.username} has ${currentKeys} keys of type ${dominantKeyType}, cannot assign 3key to avoid slot conflict`);
                return false;
              }
              
              // Chỉ cho phép nếu tài khoản đã có key loại 3key và còn slot
              if (dominantKeyType === '3key' && hasSlots) {
                console.log(`✅ Account ${account.username} has ${currentKeys} keys of type 3key, can accept more 3key`);
                return true;
              }
              
              // Nếu không rõ loại key dominant nhưng đã có key, từ chối để an toàn
              if (!dominantKeyType) {
                console.log(`❌ Account ${account.username} has ${currentKeys} keys but unknown dominant key type, rejecting for safety`);
                return false;
              }
            }
            
            // Tài khoản chưa có key nào (currentKeys === 0), có thể gán 3key
            if (currentKeys === 0) {
              console.log(`✅ Account ${account.username} is empty, can accept 3key`);
              return true;
            }
            
            if (!hasSlots) {
              console.log(`❌ Account ${account.username} has ${currentKeys}/3 keys, no slots available for 3key`);
            }
            return hasSlots;
            
          } else {
            // Default fallback for unknown key types
            console.log(`⚠️ Unknown key type: ${keyType}, using default logic`);
            const projectedMaxSlots = 3;
            return currentKeys < projectedMaxSlots;
          }
        }).map(account => ({
          ...account,
          // Normalize field names from backend to frontend expected names
          current_key_count: account.key_count || account.current_key_count || 0,
          max_key_slots: account.max_keys || account.max_key_slots || 3,
          
          // Add computed fields for display with projected slots
          projected_max_slots: (() => {
            // Calculate projected max slots based on key type being assigned
            if (keyType === '1key') return 1;
            else if (keyType === '2key') return 2; 
            else if (keyType === '3key') return 3;
            return account.max_keys || account.max_key_slots || 3;
          })(),
          available_slots: (() => {
            const currentKeys = account.key_count || account.current_key_count || 0;
            
            // Calculate available slots based on current account state and key type
            if (keyType === '1key') {
              // 1key: Account should be empty, so available = 1 - currentKeys
              return Math.max(0, 1 - currentKeys);
            } else if (keyType === '2key') {
              // 2key: Check if account is empty or has 1x2key already
              const dominantKeyType = account.dominant_key_type;
              if (currentKeys === 0) {
                // Empty account, can accept 2 keys of 2key type
                return 2;
              } else if (currentKeys === 1 && dominantKeyType === '2key') {
                // Already has 1x2key, can accept 1 more
                return 1;
              } else {
                // Other cases shouldn't appear due to filtering, but handle gracefully
                return 0;
              }
            } else if (keyType === '3key') {
              // 3key: Chỉ cho phép tài khoản trống hoặc đã có key loại 3key
              if (currentKeys === 0) {
                // Tài khoản trống, có thể nhận 3 key loại 3key
                return 3;
              } else {
                const dominantKeyType = account.dominant_key_type;
                if (dominantKeyType === '3key') {
                  // Tài khoản đã có key loại 3key, tính slot còn lại
                  return Math.max(0, 3 - currentKeys);
                } else {
                  // Tài khoản có key loại khác (1key/2key), không thể gán 3key
                  return 0;
                }
              }
            } else {
              // Default fallback
              const projectedMax = account.max_keys || account.max_key_slots || 3;
              return Math.max(0, projectedMax - currentKeys);
            }
          })(),
          can_accept_key_type: true // Already filtered for compatibility
        }))
        
        console.log(`🔍 Filtered accounts for ${keyType} key:`, {
          total: response.data.accounts.length,
          available: accountsWithSlots.length,
          keyType,
          filterLogic: {
            '1key': 'Only empty accounts (0/3 slots)',
            '2key': 'Empty accounts (0/3) or accounts with 1x2key (1/2 slots)', 
            '3key': 'Empty accounts (0/3) or accounts with existing 3key slots (1/3, 2/3) - excludes accounts with 1key/2key to avoid slot conflicts'
          }[keyType] || 'Default logic',
          accountsDetails: accountsWithSlots.map(acc => ({
            id: acc.id,
            username: acc.username,
            original_key_count: acc.key_count, // From backend
            original_max_keys: acc.max_keys, // From backend
            dominant_key_type: acc.dominant_key_type, // From backend
            normalized_current_key_count: acc.current_key_count, // Normalized
            normalized_max_key_slots: acc.max_key_slots, // Normalized
            projected_max_slots: acc.projected_max_slots,
            available_slots: acc.available_slots
          }))
        });
        
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
      
      console.log('🎉 Assign key response:', response);
      
      if (response.success) {
        // Check if backend provided updated account info
        if (response.data && response.data.updatedAccount) {
          console.log('📊 Using backend updated account data:', response.data.updatedAccount);
          
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
                projected_max_slots: projectedMax,
                available_slots: Math.max(0, projectedMax - backendAccount.current_key_count)
              }
            }
            return account
          });
          
          setAccounts([...updatedAccounts]);
          console.log(`✅ Updated account ${selectedAccountId} with backend data:`, {
            current_key_count: response.data.updatedAccount.current_key_count,
            max_key_slots: response.data.updatedAccount.max_key_slots,
            assigned_keys: response.data.updatedAccount.assigned_keys
          });
        } else {
          console.log('⚠️ No updated account data from backend, using fallback calculation');
          
          // Fallback: Cập nhật local state như trước
          const updatedAccounts = accounts.map(account => {
            if (account.id === selectedAccountId) {
              // Use normalized field names
              const currentKeys = account.current_key_count || account.key_count || 0;
              const newKeyCount = currentKeys + 1;
              const keyType = currentKeyForAssign?.key_type || currentKeyForAssign?.type || '2key';
              const projectedMax = keyType === '1key' ? 1 : keyType === '2key' ? 2 : keyType === '3key' ? 3 : (account.max_key_slots || account.max_keys || 3);
              
              console.log(`🎯 Fallback update for account ${selectedAccountId}: currentKeys=${currentKeys} -> newKeyCount=${newKeyCount}, projectedMax=${projectedMax}`);
              
              return {
                ...account,
                current_key_count: newKeyCount,
                key_count: newKeyCount, // Update both field names for compatibility
                projected_max_slots: projectedMax,
                available_slots: Math.max(0, projectedMax - newKeyCount)
              }
            }
            return account
          })
          
          setAccounts([...updatedAccounts]);
        }
        
        // Force update state và table re-render để trigger UI update
        setTableKey(prev => prev + 1) // Force table re-render
        
        // Debug log để kiểm tra state update
        const currentAccount = accounts.find(acc => acc.id === selectedAccountId);
        console.log(`🎯 Account ${selectedAccountId} update completed:`, {
          oldCount: (currentAccount?.current_key_count || currentAccount?.key_count || 0),
          keyType: currentKeyForAssign?.key_type || currentKeyForAssign?.type || '2key',
          response: response.data
        })
        
        // Hiển thị message thành công với thông tin slot change
        let successMessage = `Đã gán key ${currentKeyForAssign.code} vào tài khoản thành công!`;
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
            
            // Optionally refresh accounts list để có dữ liệu chính xác nhất từ server
            // Nhưng không làm gián đoạn UX vì local state đã được cập nhật
            await fetchAccountsWithSlots(currentKeyForAssign)
            
            // Force re-render sau khi refresh từ server
            setTableKey(prev => prev + 1)
            
            console.log('🔄 Background refresh completed')
          } catch (error) {
            console.error('Background refresh error:', error)
          }
        }, 1000)
        
        // Không đóng modal để user có thể thấy thay đổi và tiếp tục gán key khác nếu muốn
        // handleAssignCancel()
      } else {
        // Xử lý các lỗi cụ thể từ server
        const errorMessage = response.message || 'Lỗi không xác định'
        messageApi.error(`Lỗi gán key: ${errorMessage}`)
      }
    } catch (error) {
      console.error('Assign key error details:', error)
      
      // Xử lý các loại lỗi khác nhau
      let errorMessage = 'Lỗi không xác định'
      
      if (error.message.includes('Key not found or not available for assignment')) {
        errorMessage = `Key ${currentKeyForAssign.code} không tồn tại hoặc không khả dụng để gán. Key phải có trạng thái "chờ".`
      } else if (error.message.includes('Account not found')) {
        errorMessage = 'Tài khoản không tồn tại.'
      } else if (error.message.includes('already assigned')) {
        errorMessage = `Key ${currentKeyForAssign.code} đã được gán cho tài khoản này.`
      } else if (error.message.includes('maximum number of keys')) {
        errorMessage = 'Tài khoản đã đạt số lượng key tối đa.'
      } else if (error.message.includes('maximum number of accounts')) {
        errorMessage = `Key ${currentKeyForAssign.code} đã đạt số lượng tài khoản tối đa.`
      } else {
        errorMessage = error.message || 'Lỗi gán key'
      }
      
      messageApi.error(errorMessage)
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
    await fetchAccountsForTransfer()
  }

  const handleTransferCancel = () => {
    setIsTransferModalOpen(false)
    setCurrentKeyForTransfer(null)
    setSelectedTransferAccountId(null)
    setTransferAccounts([])
  }

  const fetchAccountsForTransfer = async () => {
    try {
      setLoadingTransferAccounts(true)
      const response = await accountsAPI.getAccounts()
      if (response.success && response.data && Array.isArray(response.data.accounts)) {
        // Filter accounts based on key type and dynamic slot limits
        const keyType = currentKeyForTransfer?.key_type || currentKeyForTransfer?.type || '2key';
        
        const accountsWithSlots = response.data.accounts.filter(account => {
          const currentKeys = account.current_key_count || 0
          const currentMaxSlots = account.max_key_slots || 3
          
          // Calculate what max slots would be after transferring this key type
          let projectedMaxSlots = currentMaxSlots;
          if (keyType === '1key') projectedMaxSlots = 1;
          else if (keyType === '2key') projectedMaxSlots = 2;
          else if (keyType === '3key') projectedMaxSlots = 3;
          
          // Check if account has available slots after the potential slot change
          const wouldHaveSlots = currentKeys < projectedMaxSlots;
          
          // If account has key type restrictions, check compatibility
          if (account.key_type_restrictions) {
            const isCompatible = account.key_type_restrictions === keyType;
            return wouldHaveSlots && isCompatible;
          }
          
          // For accounts without restrictions, they can accept any key type
          return wouldHaveSlots;
        })
        
        console.log(`🔄 Filtered accounts for transfer ${keyType} key:`, {
          total: response.data.accounts.length,
          available: accountsWithSlots.length,
          keyType
        });
        
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
                console.log(`Found key ${currentKeyForTransfer.id} in account ${account.id} (${account.username})`)
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
        // Sử dụng API transferKey với tài khoản nguồn đã tìm được
        console.log(`Transferring key ${currentKeyForTransfer.id} from account ${currentAccountId} to ${selectedTransferAccountId}`)
        
        try {
          const response = await accountsAPI.transferKey(
            currentKeyForTransfer.id, 
            currentAccountId, 
            selectedTransferAccountId
          )
          
          if (response.success) {
            await fetchKeys(activeGroup)
            await fetchAllKeys()
            messageApi.success(`Đã chuyển key ${currentKeyForTransfer.code} sang tài khoản mới thành công!`)
            handleTransferCancel()
            return
          } else {
            throw new Error(response.message || 'Transfer API failed')
          }
        } catch (transferError) {
          console.log('Transfer API failed, trying unassign/assign approach:', transferError.message)
          
          // Fallback: Thử unassign rồi assign
          try {
            // Unassign từ tài khoản cũ
            await accountsAPI.unassignKey(currentAccountId, currentKeyForTransfer.id)
            
            // Assign vào tài khoản mới
            const assignResponse = await accountsAPI.assignKey(selectedTransferAccountId, currentKeyForTransfer.id)
            
            if (assignResponse.success) {
              await fetchKeys(activeGroup)
              await fetchAllKeys()
              messageApi.success(`Đã chuyển key ${currentKeyForTransfer.code} sang tài khoản mới thành công!`)
              handleTransferCancel()
              return
            } else {
              throw new Error(assignResponse.message || 'Assign failed after unassign')
            }
          } catch (unassignAssignError) {
            throw new Error(`Không thể chuyển key: ${unassignAssignError.message}`)
          }
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
            await fetchKeys(activeGroup)
            await fetchAllKeys()
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
    accountCount: k.assigned_accounts ? 
      (typeof k.assigned_accounts === 'string' ? 
        JSON.parse(k.assigned_accounts).length : 
        k.assigned_accounts.length) : 
      (k.current_assignments || 0), // Use current_assignments from query or fallback to 0
    maxKeysPerAccount: k.max_keys_per_account || 2, // New field for display
    customer: k.customer_name || k.customer || '' // Fallback to empty string
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
          
          // First try to use account_details from the new query
          if (account_details && typeof account_details === 'string') {
            accounts = JSON.parse(account_details);
          } else if (Array.isArray(account_details)) {
            accounts = account_details;
          } else if (record.assigned_accounts) {
            // Fallback to assigned_accounts if account_details is not available
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
          
          // Display account usernames (simplified version)
          return (
            <div className="flex flex-wrap gap-1">
              {accounts.map((account, index) => (
                <span 
                  key={index}
                  className={`px-2 py-1 rounded text-xs ${
                    account.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : account.status === 'suspended'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                  title={`ID: ${account.account_id} | Trạng thái: ${account.status || 'unknown'}`}
                >
                  {account.username || `ID: ${account.account_id || account}`}
                </span>
              ))}
            </div>
          );
        } catch (error) {
          console.error('Error parsing account_details:', error);
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
              
              {/* Thông báo về ảnh hưởng slot */}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>💡 Lưu ý:</strong> Key loại <strong>{currentKeyForAssign.key_type || currentKeyForAssign.type || '2key'}</strong> sẽ thay đổi slot tài khoản:
                  {(currentKeyForAssign.key_type || currentKeyForAssign.type) === '1key' && (
                    <>
                      <br />• Tài khoản sẽ được giới hạn <strong>tối đa 1 slot key</strong>
                      <br />• Nếu tài khoản đã có key khác, key cũ sẽ bị gỡ bỏ
                    </>
                  )}
                  {(currentKeyForAssign.key_type || currentKeyForAssign.type) === '2key' && (
                    <>
                      <br />• Tài khoản sẽ được giới hạn <strong>tối đa 2 slot key</strong>
                      <br />• Hiển thị: số key đã gán / 2 (ví dụ: 1/2 = đã gán 1 key, còn 1 slot trống)
                    </>
                  )}
                  {(currentKeyForAssign.key_type || currentKeyForAssign.type) === '3key' && (
                    <>
                      <br />• Tài khoản sẽ giữ nguyên <strong>3 slot key</strong>
                      <br />• Không có thay đổi về giới hạn slot
                    </>
                  )}
                </p>
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
                  <strong>💡 Lưu ý:</strong> Key này sẽ được chuyển từ tài khoản hiện tại sang tài khoản mới mà bạn chọn.
                  Tài khoản cũ sẽ mất quyền sử dụng key này.
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
                message="Không có tài khoản nào có slot trống"
                description="Tất cả tài khoản đã đạt số key tối đa hoặc không có tài khoản nào."
                type="info"
                showIcon
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
                        const current = record.current_key_count || 0;
                        const currentMax = record.max_key_slots || 3;
                        
                        // Calculate what the max slots would be after transferring this key
                        const keyType = currentKeyForTransfer?.key_type || currentKeyForTransfer?.type || '2key';
                        let projectedMax = currentMax;
                        if (keyType === '1key') projectedMax = 1;
                        else if (keyType === '2key') projectedMax = 2;
                        else if (keyType === '3key') projectedMax = 3;
                        
                        // Check if account would be full after transfer
                        const wouldBeFull = (current + 1) >= projectedMax;
                        const isIncompatible = record.key_type_restrictions && record.key_type_restrictions !== keyType;
                        
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${
                                current >= currentMax ? 'text-red-600 font-bold' :
                                current > currentMax * 0.7 ? 'text-orange-600' :
                                'text-gray-600'
                              }`}>
                                {current}/{currentMax}
                              </span>
                              {record.key_type_restrictions && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  🔒 {record.key_type_restrictions}
                                </span>
                              )}
                            </div>
                            
                            {/* Show projected slots after transfer */}
                            {projectedMax !== currentMax && (
                              <div className="text-xs">
                                {projectedMax < currentMax ? (
                                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                                    📉 Sau chuyển: {current + 1}/{projectedMax} (slot: {currentMax} → {projectedMax})
                                  </span>
                                ) : (
                                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                    📈 Sau chuyển: {current + 1}/{projectedMax} (slot: {currentMax} → {projectedMax})
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {projectedMax === currentMax && (
                              <div className="text-xs">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  → Sau chuyển: {current + 1}/{projectedMax}
                                </span>
                              </div>
                            )}
                            
                            {isIncompatible && (
                              <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-medium">
                                ⚠️ Không tương thích
                              </span>
                            )}
                            
                            {wouldBeFull && (
                              <span className="text-xs text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded font-medium">
                                ⚠️ Sẽ đầy sau chuyển
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