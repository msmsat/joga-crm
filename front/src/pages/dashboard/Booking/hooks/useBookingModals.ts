import { useState } from 'react'

export function useBookingModals() {
  const [isTgModalOpen,    setTgModalOpen]    = useState(false)
  const [isInstaModalOpen, setInstaModalOpen] = useState(false)
  const [isWebModalOpen,   setWebModalOpen]   = useState(false)
  const [isWaModalOpen,    setWaModalOpen]    = useState(false)

  return {
    isTgModalOpen,    setTgModalOpen,
    isInstaModalOpen, setInstaModalOpen,
    isWebModalOpen,   setWebModalOpen,
    isWaModalOpen,    setWaModalOpen,
  }
}
