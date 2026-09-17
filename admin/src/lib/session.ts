/** Токен админки. localStorage: перезагрузка страницы не должна выкидывать
 *  на экран входа каждый раз. */
const KEY = 'velora_admin_token'

export const session = {
  read(): string | null {
    try { return localStorage.getItem(KEY) } catch { return null }
  },
  save(token: string) {
    try { localStorage.setItem(KEY, token) } catch { /* приватный режим */ }
  },
  clear() {
    try { localStorage.removeItem(KEY) } catch { /* приватный режим */ }
  },
}
