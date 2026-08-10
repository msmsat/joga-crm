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

export const SUPPORT_EMAIL = 'smat5302@gmail.com'

// Подвал страниц входа и регистрации.
export const LEGAL_FOOTER_LINKS = [
  { label: 'Конфиденциальность', href: PRIVACY_URL },
  { label: 'Условия', href: TERMS_URL },
  { label: 'Поддержка', href: `mailto:${SUPPORT_EMAIL}` },
]

// Колонка «Документы» в подвале лендинга.
export const LEGAL_DOC_LINKS = [
  { label: 'Условия использования', href: TERMS_URL },
  { label: 'Политика конфиденциальности', href: PRIVACY_URL },
  { label: 'Обработка данных', href: DPA_URL },
  { label: 'Поддержка', href: `mailto:${SUPPORT_EMAIL}` },
]
