import { useContext } from 'react'
import SettingsContext from '../contexts/SettingsContext'

// Custom hook để sử dụng Settings Context
export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
