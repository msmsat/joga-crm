import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { staffApi } from '../../../../api/staff'
import { queryKeys } from '../../../../api/queryKeys'
import type { StaffListResponse, StaffCreate, StaffUpdate } from '../../../../api/staff/staff.types'

// Как часто перечитывать список, пока кто-то не принял приглашение.
const PENDING_POLL_MS = 20_000

export function useStaffList() {
  const qc = useQueryClient()
  // Сотрудник — это ещё и цены услуг: его своя цена и сам факт, что он ведёт
  // услугу, двигают «от–до» в Каталоге, цену тренера в Журнале и список
  // мастеров в кассе. Эти экраны держат услуги в кэше (staleTime 30 с), и без
  // сброса владелец полминуты видел бы там цену, которую только что поменял.
  const invalidatePrices = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.services })
    void qc.invalidateQueries({ queryKey: queryKeys.checkoutServices })
  }
  const [data, setData] = useState<StaffListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = async () => {
    setIsLoading(true)
    try { setData(await staffApi.getList()) }
    finally { setIsLoading(false) }
  }

  // Первая загрузка идёт мимо refetch(): isLoading и так true, а setIsLoading(true)
  // прямо в эффекте — лишний синхронный рендер.
  useEffect(() => {
    staffApi.getList().then(setData).finally(() => setIsLoading(false))
  }, [])

  // Приглашение принимают ВНЕ CRM — по ссылке из письма, и узнать об этом
  // приложению больше неоткуда. Пока в списке есть ожидающие, тихо перечитываем
  // его: карточка разблокируется сама, без F5. Ожидающих нет — интервала нет,
  // фонового трафика на обычной студии не появляется.
  // ponytail: опрос раз в 20 секунд; понадобится мгновенность — SSE/вебсокет.
  const hasPending = (data?.staff.items ?? []).some(s => !s.is_active)

  useEffect(() => {
    if (!hasPending) return
    const id = setInterval(() => {
      // Без setIsLoading: это фоновое обновление, и мигать списком оно не должно.
      staffApi.getList().then(setData).catch(() => {})
    }, PENDING_POLL_MS)
    return () => clearInterval(id)
  }, [hasPending])

  const create = async (payload: StaffCreate) => {
    const result = await staffApi.create(payload)
    invalidatePrices()
    await refetch()
    return result
  }

  const update = async (id: number, payload: StaffUpdate) => {
    await staffApi.update(id, payload)
    invalidatePrices()
    await refetch()
  }

  const deleteStaff = async (id: number) => {
    await staffApi.delete(id)
    invalidatePrices()
    await refetch()
  }

  return { summary: data?.summary, rawStaff: data?.staff.items ?? [], isLoading, refetch, create, update, deleteStaff }
}
