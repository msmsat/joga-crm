import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

// Telegram-бот у студии один, но его статус виден на трёх страницах (Velora AI,
// Уведомления, Онлайн-запись) и приходит тремя разными ответами API. Любое
// подключение/отключение обязано освежить все три ключа — иначе две страницы,
// которых сейчас нет на экране, останутся с протухшим статусом из кэша.
export function invalidateTelegramBotGroup(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.aiSettings })
  qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations })
  qc.invalidateQueries({ queryKey: queryKeys.bookingChannels })
}
