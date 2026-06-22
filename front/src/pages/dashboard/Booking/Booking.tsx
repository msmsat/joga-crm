import './Booking.css'
import { useBookingModals }   from './hooks/useBookingModals'
import { useBookingSettings } from './hooks/useBookingSettings'
import { BookingChannels }    from './components/sections/BookingChannels'
import { BookingSettings }    from './components/sections/BookingSettings'
import { TgModal }            from './components/modals/TgModal'
import { InstaModal }         from './components/modals/InstaModal'
import { WebModal }           from './components/modals/WebModal'
import { WaModal }            from './components/modals/WaModal'
import { StudioMockup }       from './components/modals/StudioMockup'

export default function Booking() {
  const modals   = useBookingModals()
  const settings = useBookingSettings()

  return (
    <>
      <BookingChannels
        onOpenTg={()    => modals.setTgModalOpen(true)}
        onOpenInsta={()  => modals.setInstaModalOpen(true)}
        onOpenWeb={()    => modals.setWebModalOpen(true)}
        onOpenWa={()     => modals.setWaModalOpen(true)}
      />

      <BookingSettings
        limitTime={settings.limitTime}   setLimitTime={settings.setLimitTime}
        openDays={settings.openDays}     setOpenDays={settings.setOpenDays}
        cancelTime={settings.cancelTime} setCancelTime={settings.setCancelTime}
        language={settings.language}     setLanguage={settings.setLanguage}
      />

      {modals.isTgModalOpen    && <TgModal    onClose={() => modals.setTgModalOpen(false)} />}
      {modals.isInstaModalOpen && <InstaModal onClose={() => modals.setInstaModalOpen(false)} />}
      {modals.isWebModalOpen   && <WebModal   onClose={() => modals.setWebModalOpen(false)} />}
      {modals.isWaModalOpen    && <WaModal    onClose={() => modals.setWaModalOpen(false)} />}
      {modals.isMockupOpen     && <StudioMockup onClose={() => modals.setMockupOpen(false)} />}
    </>
  )
}
