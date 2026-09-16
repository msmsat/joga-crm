import i18n from '../i18n'
import { authApi } from '../api/auth/auth.api'
import { DEFAULT_LANG, chosenLang, isSupportedLang, rememberGeoLang, rememberLang } from '../utils/lang'

/**
 * Язык сайта при открытии — один запрос на старте приложения.
 *
 * Приоритет: явный выбор в браузере → личный язык аккаунта → текущий IP → en.
 * Язык студии и старые автоматические кэши не являются выбором человека.
 * Даже при наличии токена сервер может вернуть IP (нет личного выбора или
 * токен истёк): такой ответ тоже применяется.
 *
 * Пока запрос шёл, язык мог смениться (переключатель лендинга, онбординг,
 * кабинет). Этот выбор свежее ответа, и ответ его не перетирает.
 */
export async function detectLanguage(): Promise<void> {
  const initial = i18n.language
  let result
  try {
    // allowUnauthorized: протухший токен на лендинге не повод уводить на /login.
    result = await authApi.getLocale()
  } catch {
    return
  }
  const { source } = result
  const language = isSupportedLang(result.language) ? result.language : DEFAULT_LANG
  if (chosenLang() || i18n.language !== initial) return
  if (source === 'ip') {
    rememberGeoLang(language)
  }
  if (source === 'account') rememberLang(language)
  if (language !== i18n.language) void i18n.changeLanguage(language)
}
