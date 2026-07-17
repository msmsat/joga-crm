import './Booking.css'
import { useBookingModals }   from './hooks/useBookingModals'
import { useBookingSettings } from './hooks/useBookingSettings'
import { useTgBot }           from './hooks/useTgBot'
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
  const tgBot    = useTgBot()

  return (
    <>
      <BookingChannels
        tgStatus={tgBot.statusOf('telegram')}
        instaStatus={tgBot.statusOf('instagram')}
        webStatus={tgBot.statusOf('web')}
        waStatus={tgBot.statusOf('whatsapp')}
        onOpenTg={()    => modals.setTgModalOpen(true)}
        onOpenInsta={()  => modals.setInstaModalOpen(true)}
        onOpenWeb={()    => modals.setWebModalOpen(true)}
        onOpenWa={()     => modals.setWaModalOpen(true)}
      />

      <BookingSettings {...settings} />

      {modals.isTgModalOpen    && (
        <TgModal
          connected={tgBot.connected}
          botName={tgBot.botName}
          token={tgBot.token}
          onConnect={tgBot.connect}
          onDisconnect={tgBot.disconnect}
          onClose={() => modals.setTgModalOpen(false)}
        />
      )}
      {modals.isInstaModalOpen && <InstaModal onClose={() => modals.setInstaModalOpen(false)} />}
      {modals.isWebModalOpen   && <WebModal   onClose={() => modals.setWebModalOpen(false)} />}
      {modals.isWaModalOpen    && <WaModal    onClose={() => modals.setWaModalOpen(false)} />}
      {modals.isMockupOpen     && <StudioMockup onClose={() => modals.setMockupOpen(false)} />}
    </>
  )
}
