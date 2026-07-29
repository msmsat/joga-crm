import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

// Telegram-бот и Instagram-аккаунт у студии одни, но их статус виден на четырёх
// страницах (Velora AI, Уведомления, Настройки → Интеграции, Онлайн-запись) и
// приходит разными ответами API. Любое подключение/отключение обязано освежить
// все ключи — иначе страницы, которых сейчас нет на экране, останутся с
// протухшим статусом из кэша.
export function invalidateChannelGroup(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.aiSettings })
  qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations })
  qc.invalidateQueries({ queryKey: queryKeys.integrations })
  qc.invalidateQueries({ queryKey: queryKeys.bookingChannels })
}
