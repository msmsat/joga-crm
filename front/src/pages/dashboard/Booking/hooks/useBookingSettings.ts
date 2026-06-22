import { useState } from 'react'

export function useBookingSettings() {
  const [limitTime,  setLimitTime]  = useState('2 часа')
  const [openDays,   setOpenDays]   = useState('7 дней')
  const [cancelTime, setCancelTime] = useState('4 часа')
  const [language,   setLanguage]   = useState('Русский')

  return { limitTime, setLimitTime, openDays, setOpenDays, cancelTime, setCancelTime, language, setLanguage }
}
