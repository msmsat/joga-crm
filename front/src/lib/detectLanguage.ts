import i18n from '../i18n'
import { authApi } from '../api/auth/auth.api'
import { getActiveToken } from '../utils/auth'
import { chosenLang, isSupportedLang, rememberGeoLang, rememberLang } from '../utils/lang'

/**
 * Язык сайта при открытии — один запрос на старте приложения.
 *
 * Что главнее, решает сервер (GET /auth/locale): вошедшему — язык из БД,
 * гостю — язык страны его IP. Здесь только применяем ответ:
 *  - язык из БД запоминается как выбор (ui_language). Человек, сменивший язык
 *    в настройках, после выхода видит лендинг на нём, а не на языке страны;
 *  - язык страны — только догадка. Он не перебивает сделанный раньше выбор и
 *    не трогает вошедшего: у того язык либо в БД, либо выбирается на
 *    онбординге, который сам стартует с этой догадки (utils/lang.initialLang).
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
  const { language, source } = result
  if (!isSupportedLang(language)) return

  if (source === 'ip') {
    rememberGeoLang(language)
    if (chosenLang() || getActiveToken()) return
  }
  if (i18n.language !== initial) return
  if (source === 'account') rememberLang(language)
  if (language !== i18n.language) void i18n.changeLanguage(language)
}
