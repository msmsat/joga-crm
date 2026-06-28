import { useState, useEffect } from 'react'
import { staffApi } from '../../../../api/staff'
import type { StaffProfile, StaffMonthScheduleResponse } from '../../../../api/staff/staff.types'

export function useStaffProfile(staffId: number | null) {
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [monthData, setMonthData] = useState<StaffMonthScheduleResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!staffId) return
    setIsLoading(true)
    setProfile(null)
    staffApi.getProfile(staffId).then(setProfile).finally(() => setIsLoading(false))
  }, [staffId])

  const refetchProfile = () => {
    if (!staffId) return
    staffApi.getProfile(staffId).then(setProfile)
  }

  const fetchMonth = async (year?: number, month?: number) => {
    if (!staffId) return
    setMonthData(await staffApi.getMonthSchedule(staffId, year, month))
  }

  const cancelLesson = async (lessonId: number) => {
    if (!staffId) return
    await staffApi.cancelLesson(staffId, lessonId)
    staffApi.getProfile(staffId).then(setProfile)
  }

  return { profile, monthData, isLoading, refetchProfile, fetchMonth, cancelLesson }
}
