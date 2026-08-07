import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../../../../api/notifications'
import { queryKeys } from '../../../../api/queryKeys'
import type { NotificationLogQuery, NotificationLogStatus } from '../../../../api/notifications/notifications.types'

const PAGE_SIZE = 25

export interface LogFilters {
  status?: NotificationLogStatus
  channel?: string
  search: string
}

export function useNotificationLog() {
  const [filters, setFilters] = useState<LogFilters>({ search: '' })
  const [offset, setOffset] = useState(0)

  const query: NotificationLogQuery = {
    status: filters.status,
    channel: filters.channel,
    search: filters.search.trim() || undefined,
    offset,
    limit: PAGE_SIZE,
  }

  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: queryKeys.notificationLog(JSON.stringify(query)),
    queryFn: () => notificationsApi.getLog(query),
    // Страница не мигает пустотой при листании и смене фильтра — журнал читают
    // сравнивая соседние строки, и потеря контекста на каждый клик мешает.
    placeholderData: keepPreviousData,
  })

  // Любая смена фильтра возвращает на первую страницу: остаться на 4-й в новой
  // выборке — это пустой экран и «журнал сломался».
  const patch = (next: Partial<LogFilters>) => {
    setFilters(prev => ({ ...prev, ...next }))
    setOffset(0)
  }

  return {
    filters,
    setStatus: (status?: NotificationLogStatus) => patch({ status }),
    setChannel: (channel?: string) => patch({ channel }),
    setSearch: (search: string) => patch({ search }),
    data,
    loading: isPending,
    refreshing: isFetching && !isPending,
    loadError: isError,
    offset,
    pageSize: PAGE_SIZE,
    canPrev: offset > 0,
    canNext: !!data && offset + PAGE_SIZE < data.total,
    prev: () => setOffset(o => Math.max(0, o - PAGE_SIZE)),
    next: () => setOffset(o => o + PAGE_SIZE),
  }
}
