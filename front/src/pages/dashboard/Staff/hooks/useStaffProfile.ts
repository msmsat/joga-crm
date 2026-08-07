import { useState, useEffect, useCallback } from 'react'
import { staffApi } from '../../../../api/staff'
import type { StaffProfile, StaffMonthScheduleResponse } from '../../../../api/staff/staff.types'

export function useStaffProfile(staffId: number | null) {
  // Профиль храним вместе с id, для которого он загружен: «грузим» и «показываем
  // чужой профиль» тогда различаются без отдельных флагов, а ответ на устаревший
  // запрос отбрасывается сам.
  const [loaded, setLoaded] = useState<{ id: number | null; profile: StaffProfile | null }>({ id: null, profile: null })
  const [monthData, setMonthData] = useState<StaffMonthScheduleResponse | null>(null)

  const load = (id: number) => staffApi.getProfile(id).then(p => setLoaded({ id, profile: p }))

  useEffect(() => {
    if (!staffId) return
    load(staffId)
  }, [staffId])

  const profile = loaded.id === staffId ? loaded.profile : null
  const isLoading = staffId != null && loaded.id !== staffId

  const refetchProfile = () => {
    if (!staffId) return
    load(staffId)
  }

  // useCallback: Staff.tsx держит fetchMonth в зависимостях эффекта — без
  // стабильной ссылки месяц перезапрашивался бы на каждый рендер.
  const fetchMonth = useCallback(async (year?: number, month?: number) => {
    if (!staffId) return
    setMonthData(await staffApi.getMonthSchedule(staffId, year, month))
  }, [staffId])

  const cancelLesson = async (lessonId: number) => {
    if (!staffId) return
    await staffApi.cancelLesson(staffId, lessonId)
    load(staffId)
  }

  return { profile, monthData, isLoading, refetchProfile, fetchMonth, cancelLesson }
}
