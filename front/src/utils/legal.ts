// Юридические документы отдаёт бэкенд как статику (back/static/*.html), поэтому
// путь надо префиксовать адресом API: без префикса браузер запросит их у
// дев-сервера фронта и получит index.html. Тот же приём, что resolveImageUrl.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const TERMS_URL = `${API_URL}/static/terms.html`
export const PRIVACY_URL = `${API_URL}/static/privacy.html`
// Приложение об обработке данных (ст. 28 GDPR) — раздел внутри Условий.
export const DPA_URL = `${TERMS_URL}#dpa`

// Открывать документы только новой вкладкой: на регистрации уход со страницы
// стирает уже введённые шаги, а на /join — токен приглашения из адреса.
export const LEGAL_LINK_PROPS = { target: '_blank', rel: 'noreferrer' } as const

// Адрес из самих документов (back/static/terms.html, privacy.html): туда по
// GDPR пишут про данные, и он обязан оставаться письменным каналом. Живое
// общение — весь «напишите нам» в интерфейсе — идёт в WhatsApp ниже.
export const SUPPORT_EMAIL = 'smat5302@gmail.com'

// Единственный канал связи в интерфейсе. wa.me хочет номер без «+», пробелов
// и скобок — иначе ссылка открывает пустой WhatsApp без диалога.
export const SUPPORT_WHATSAPP = '+420 722 274 622'
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}`

// Подвал страниц входа и регистрации.
export const LEGAL_FOOTER_LINKS = [
  { label: 'Конфиденциальность', href: PRIVACY_URL },
  { label: 'Условия', href: TERMS_URL },
  { label: 'Поддержка', href: SUPPORT_WHATSAPP_URL },
]

// Колонка «Документы» в подвале лендинга.
export const LEGAL_DOC_LINKS = [
  { label: 'Условия использования', href: TERMS_URL },
  { label: 'Политика конфиденциальности', href: PRIVACY_URL },
  { label: 'Обработка данных', href: DPA_URL },
  { label: 'Поддержка', href: SUPPORT_WHATSAPP_URL },
]
