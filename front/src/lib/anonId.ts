/**
 * Идентификатор браузера для склейки анонимного визита с регистрацией.
 *
 * localStorage, а не sessionStorage: человек часто приходит на лендинг в один
 * день, а регистрируется в другой, и в sessionStorage такой путь терялся бы
 * целиком. Это первичный аналитический идентификатор — он упомянут в политике
 * cookies.
 *
 * Хранилище может быть недоступно (приватный режим, заблокированные данные
 * сайта) и тогда сам доступ к нему бросает исключение. В этом случае живём с
 * разовым идентификатором в памяти: аналитика — не повод уронить страницу.
 */
const KEY = 'velora_anon'

let memoryFallback: string | null = null

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getAnonId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const fresh = createId()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    if (!memoryFallback) memoryFallback = createId()
    return memoryFallback
  }
}
