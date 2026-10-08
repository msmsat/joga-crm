import { useState } from 'react'
import { useNavigate } from 'react-router'
import './Booking.css'
import { useBookingModals }   from './hooks/useBookingModals'
import { useBookingSettings } from './hooks/useBookingSettings'
import { useChannels }        from './hooks/useChannels'
import { useGateways }        from '../Finances/hooks/useFinances'
import { useAiIntent }        from '../../../hooks/useAiIntent'
import { BookingChannels }    from './components/sections/BookingChannels'
import { BookingSettings }    from './components/sections/BookingSettings'
import { CoffeeSettings }     from './components/sections/CoffeeSettings'
import { TgModal }            from './components/modals/TgModal'
import { StripeGateModal }    from './components/modals/StripeGateModal'
import { useStripeReturn } from './hooks/useStripeReturn'
import { stripeGateState, STRIPE_REFRESH_KEY } from './stripeStatus'
import { getActiveContextKey } from '../../../utils/auth'

const BOOKING_PATH = '/dashboard/booking'
const FINANCES_PATH = '/dashboard/finances?tab=onlinePayments'

export default function Booking() {
  const navigate = useNavigate()
  const settings = useBookingSettings()

  // Приём оплат — отдельный канал, а не условие остальных. Статус живой, со
  // стороны Stripe: charges_enabled может выключиться сам (истёк документ, не
  // пройдена проверка). is_active — тумблер владельца на странице Финансов,
  // Stripe о нём не знает.
  const { gateways, isLoading: gatewaysLoading, isFetching, isError, refetch, connectStripe, isConnecting, connectError } = useGateways()
  const stripe = gateways.find(g => g.gateway_type === 'stripe')
  const gateState = stripeGateState(stripe, gatewaysLoading, isError)
  useStripeReturn({ refetch, connectStripe })

  // Ассистент: /dashboard/booking?ai=booking.rules (эпик AI-6, задача 9).
  // У блока правил своей модалки нет, поэтому просто прокручиваем к нему:
  // «открыл страницу» без прокрутки выглядит как «ничего не произошло».
  useAiIntent('booking.rules', () => {
    // Секция появляется вместе с загруженными настройками — ждём кадр отрисовки.
    requestAnimationFrame(() => {
      document.getElementById('booking-rules')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  const modals = useBookingModals()
  const tgBot  = useChannels()
  const [gateOpen, setGateOpen] = useState(() => {
    const flag = new URLSearchParams(window.location.search).get('stripe')
    return flag === 'return' || flag === 'refresh'
  })

  const openStripe = () => setGateOpen(true)

  // Анкета Stripe открывается на месте и возвращает СЮДА (return_path), а не в
  // Финансы: владелец начал настройку на этой странице. Дозаполнить анкету —
  // тоже сюда; включить обратно выключенный приём можно только тумблером в
  // Финансах, поэтому там уводим.
  const gateAction = () => {
    if (gateState === 'ready' || gateState === 'paused') navigate(FINANCES_PATH)
    else if (gateState === 'none' || gateState === 'incomplete' || gateState === 'requiresInfo') {
      // A deliberate continuation starts a new link attempt. Automatic refresh
      // keeps its guard across page reloads to prevent expired-link loops.
      try { sessionStorage.removeItem(STRIPE_REFRESH_KEY + getActiveContextKey()) } catch { /* optional storage */ }
      connectStripe(BOOKING_PATH)
    } else if (gateState !== 'loading') void refetch()
  }

  return (
    <>
      <BookingChannels
        tgStatus={tgBot.connected ? 'connected' : null}
        stripeStatus={gateState === 'ready' ? 'connected' : stripe?.account_id ? 'pending' : null}
        stripeState={gateState}
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

      {gateOpen && (
        <StripeGateModal
          state={gateState}
          gateway={stripe}
          isConnecting={isConnecting}
          isRefreshing={isFetching}
          connectError={connectError}
          onConnect={gateAction}
          onRefresh={() => { void refetch() }}
          onClose={() => setGateOpen(false)}
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
