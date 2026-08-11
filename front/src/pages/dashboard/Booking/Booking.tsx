import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import './Booking.css'
import { useBookingModals }   from './hooks/useBookingModals'
import { useBookingSettings } from './hooks/useBookingSettings'
import { useChannels }        from './hooks/useChannels'
import { useGateways }        from '../Finances/hooks/useFinances'
import { useToast }           from '../../../components/ui/Toast'
import { BookingChannels }    from './components/sections/BookingChannels'
import { BookingSettings }    from './components/sections/BookingSettings'
import { CoffeeSettings }     from './components/sections/CoffeeSettings'
import { TgModal }            from './components/modals/TgModal'
import { StripeGateModal }    from './components/modals/StripeGateModal'

const BOOKING_PATH = '/dashboard/booking'
const FINANCES_PATH = '/dashboard/finances?tab=onlinePayments'

export default function Booking() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation('booking')
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
  const tgBot  = useChannels()

  // Анкета Stripe открывается на месте и возвращает СЮДА (return_path), а не в
  // Финансы: владелец начал настройку на этой странице. Дозаполнить анкету —
  // тоже сюда; включить обратно выключенный приём можно только тумблером в
  // Финансах, поэтому там уводим.
  const openStripe = () => {
    if (gateState === 'loading') return
    if (gateState === 'none' || gateState === 'incomplete') connectStripe(BOOKING_PATH)
    else navigate(FINANCES_PATH)
  }

  // Возврат с формы Stripe (?stripe=return|refresh): статус уже перезапрошен
  // монтированием useGateways — остаётся объяснить, что произошло.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('stripe')
    if (!flag) return
    if (flag === 'refresh') toast.error(t('toasts.stripeLinkExpired'))
    else toast.success(t('toasts.stripeReturned'))
    params.delete('stripe')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
  }, [toast, t])

  return (
    <>
      <BookingChannels
        tgStatus={tgBot.connected ? 'connected' : null}
        stripeStatus={stripeReady ? 'connected' : stripe?.account_id ? 'pending' : null}
        miniappUrl={settings.settings?.miniapp_url ?? ''}
        onOpenTg={() => modals.open('telegram')}
        onOpenStripe={openStripe}
      />

      <BookingSettings {...settings} />

      {/* Только с загруженными настройками: CoffeeSettings засевает черновик
          мест из useState, а он читает пропсы лишь на первом рендере — смонтировав
          секцию раньше ответа, мы бы навсегда показали пустой список вместо
          сохранённых мест. */}
      {settings.settings && (
        <div style={{ marginTop: '24px' }}>
          <CoffeeSettings {...settings} />
        </div>
      )}

      {modals.gated && (
        <StripeGateModal
          state={gateState}
          isConnecting={isConnecting}
          onConnect={gateState === 'disabled' ? () => navigate(FINANCES_PATH) : () => connectStripe(BOOKING_PATH)}
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
    </>
  )
}
