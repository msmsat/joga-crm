import { useNavigate } from 'react-router'
import './Booking.css'
import { useBookingModals }   from './hooks/useBookingModals'
import { useBookingSettings } from './hooks/useBookingSettings'
import { useChannels }        from './hooks/useChannels'
import { useGateways }        from '../Finances/hooks/useFinances'
import { BookingChannels }    from './components/sections/BookingChannels'
import { BookingSettings }    from './components/sections/BookingSettings'
import { TgModal }            from './components/modals/TgModal'
import { InstaModal }         from './components/modals/InstaModal'
import { WebModal }           from './components/modals/WebModal'
import { WaModal }            from './components/modals/WaModal'
import { StripeGateModal }    from './components/modals/StripeGateModal'

export default function Booking() {
  const navigate = useNavigate()
  const settings = useBookingSettings()

  // Приём оплат — общий шлюз всех каналов. Статус живой, со стороны Stripe:
  // charges_enabled может выключиться сам (истёк документ, не пройдена проверка).
  // is_active — тумблер владельца на странице Финансов, Stripe о нём не знает.
  const { gateways, isLoading: gatewaysLoading, connectStripe, isConnecting } = useGateways()
  const stripe = gateways.find(g => g.gateway_type === 'stripe')
  const stripeReady = gatewaysLoading ? undefined : !!(stripe?.charges_enabled && stripe?.is_active)

  const gateState = gatewaysLoading
    ? 'loading'
    : !stripe?.account_id
      ? 'none'
      : !stripe.charges_enabled
        ? 'incomplete'
        : 'disabled' // charges_enabled=true, is_active=false — выключен тумблером на Финансах

  const modals = useBookingModals(stripeReady)
  const tgBot  = useChannels(stripeReady)

  return (
    <>
      <BookingChannels
        tgStatus={tgBot.statusOf('telegram')}
        instaStatus={tgBot.statusOf('instagram')}
        webStatus={tgBot.statusOf('web')}
        waStatus={tgBot.statusOf('whatsapp')}
        onOpenTg={()    => modals.open('telegram')}
        onOpenInsta={() => modals.open('instagram')}
        onOpenWeb={()   => modals.open('web')}
        onOpenWa={()    => modals.open('whatsapp')}
      />

      <BookingSettings {...settings} />

      {modals.gated && (
        <StripeGateModal
          state={gateState}
          isConnecting={isConnecting}
          onConnect={gateState === 'disabled' ? () => navigate('/dashboard/finances?tab=onlinePayments') : connectStripe}
          onClose={modals.close}
        />
      )}

      {modals.openChannel === 'telegram' && (
        <TgModal
          connected={tgBot.connected}
          botName={tgBot.botName}
          token={tgBot.token}
          onConnect={tgBot.connect}
          onDisconnect={tgBot.disconnect}
          onClose={modals.close}
        />
      )}
      {modals.openChannel === 'instagram' && <InstaModal onClose={modals.close} />}
      {modals.openChannel === 'web'       && <WebModal   onClose={modals.close} />}
      {modals.openChannel === 'whatsapp'  && <WaModal    onClose={modals.close} />}
    </>
  )
}
