// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface StaffCreate {
  name: string
  last_name?: string | null
  email: string
  phone?: string | null
  role: string
  department?: string | null
  salary?: number | null
  rate?: number | null
  rate_type?: 'fixed' | 'percent' | 'hourly' | null
}

export type StaffUpdate = StaffCreate

export interface StaffMessagePayload {
  text: string
  channel: 'whatsapp' | 'telegram' | 'email'
}

export interface StaffCallPayload {
  channel: 'phone' | 'whatsapp'
}

// ─── Nested ───────────────────────────────────────────────────────────────────

export interface StaffHall {
  id: number
  name: string
  color: string | null
}

export interface StaffWorkingHoursItem {
  day_of_week: number  // 0=Пн … 6=Вс
  is_open: boolean
  open_time: string    // "HH:MM"
  close_time: string   // "HH:MM"
}

export interface StaffTodayLesson {
  id: number
  name: string
  start_time: string   // "HH:MM"
  duration_min: number
  booked_count: number
  total_spots: number
  hall: StaffHall | null
}

export interface StaffMonthLesson {
  id: number
  name: string
  start_time: string   // ISO datetime
  duration_min: number
  status: 'confirmed' | 'pending' | 'cancelled'
  total_spots: number
  booked_count: number
  hall: StaffHall | null
}

export interface StaffStats {
  total_bookings: number
  total_attended: number
  load_percent: number
  total_revenue: number
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface StaffListItem {
  id: number
  name: string
  last_name: string | null
  email: string
  phone: string | null
  role: string
  department: string | null
  is_online: boolean
  photo_url: string | null
  avatar_gradient: string | null
}

export interface StaffSummary {
  total: number
  online: number
  by_role: Record<string, number>
}

export interface StaffListResponse {
  summary: StaffSummary
  staff: StaffListItem[]
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface StaffProfile extends StaffListItem {
  is_active: boolean
  salary: number | null
  rate: number | null
  rate_type: 'fixed' | 'percent' | 'hourly' | null
  avg_rating: number | null
  stats: StaffStats
  halls: StaffHall[]
  today_schedule: StaffTodayLesson[]
  week_working_hours: StaffWorkingHoursItem[]
}

// ─── Mutation responses ───────────────────────────────────────────────────────

export interface StaffMutateResponse {
  ok: boolean
  staff: StaffListItem
}

// ─── Schedule responses ───────────────────────────────────────────────────────

export interface StaffWeekScheduleResponse {
  staff_id: number
  working_hours: StaffWorkingHoursItem[]
}

export interface StaffMonthScheduleResponse {
  staff_id: number
  year: number
  month: number
  lessons: StaffMonthLesson[]
}

export interface StaffTodayScheduleResponse {
  staff_id: number
  date: string
  lessons: StaffTodayLesson[]
}

export interface StaffCancelLessonResponse {
  ok: boolean
  lesson_id: number
  cancelled_reservations: number
}

// ─── Action responses ─────────────────────────────────────────────────────────

export interface StaffMessageResponse {
  ok: boolean
  channel: string
  recipient: string | null
  staff_id: number
}

export interface StaffCallResponse {
  ok: boolean
  channel: string
  phone: string
  staff_id: number
}
