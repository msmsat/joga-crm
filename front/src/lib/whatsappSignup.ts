// WhatsApp Embedded Signup: подключение номера в 1 клик вместо ручного ввода
// токена и Phone Number ID из Meta Business Suite.
//
// Meta даёт этот флоу только своим JS SDK (npm-пакета нет) — грузим sdk.js по
// первому клику, а не в index.html: без подключения WhatsApp он никому не нужен.
// FB.login возвращает code, а waba_id/phone_number_id приходят отдельным
// postMessage-событием WA_EMBEDDED_SIGNUP — code без них бесполезен, поэтому
// слушателя вешаем ДО login.

const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined
const CONFIG_ID = import.meta.env.VITE_WA_CONFIG_ID as string | undefined
const SDK_VERSION = 'v20.0'
const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const FB_ORIGINS = ['https://www.facebook.com', 'https://web.facebook.com']

export interface WaSignupResult {
  code: string
  waba_id: string
  phone_number_id: string
}

export const isWhatsAppSignupConfigured = () => !!APP_ID && !!CONFIG_ID

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { FB?: any }
}

let sdkPromise: Promise<any> | null = null

function loadSdk(): Promise<any> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB)
    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      window.FB.init({ appId: APP_ID, cookie: true, xfbml: false, version: SDK_VERSION })
      resolve(window.FB)
    }
    script.onerror = () => {
      sdkPromise = null // блокировщик рекламы/офлайн — дать шанс повторному клику
      reject(new Error('sdk_load_failed'))
    }
    document.head.appendChild(script)
  })
  return sdkPromise
}

export async function launchWhatsAppSignup(): Promise<WaSignupResult> {
  if (!isWhatsAppSignupConfigured()) throw new Error('not_configured')
  const FB = await loadSdk()

  return new Promise<WaSignupResult>((resolve, reject) => {
    let session: Partial<WaSignupResult> = {}

    const onMessage = (event: MessageEvent) => {
      if (!FB_ORIGINS.includes(event.origin)) return
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'WA_EMBEDDED_SIGNUP' && payload.event === 'FINISH') session = payload.data
      } catch {
        // Meta шлёт в это же окно и не-JSON служебные сообщения — игнорируем.
      }
    }
    window.addEventListener('message', onMessage)

    FB.login(
      (response: any) => {
        window.removeEventListener('message', onMessage)
        const code = response?.authResponse?.code
        if (!code) return reject(new Error('cancelled'))
        if (!session.waba_id || !session.phone_number_id) return reject(new Error('incomplete'))
        resolve({ code, waba_id: session.waba_id, phone_number_id: session.phone_number_id })
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      },
    )
  })
}
