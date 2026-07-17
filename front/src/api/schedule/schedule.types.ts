export interface Hall {
  id: number
  name: string
  color: string
  capacity: number
  is_online: boolean
  is_active: boolean
}

export interface Lesson {
  id: number
  name: string
  teacher_id: number | null
  teacher_name: string | null
  hall_id: number | null
  start_time: string
  duration_min: number
  price: number
  total_spots: number
  booked_count: number
  status: 'confirmed' | 'pending' | 'cancelled'
  level: string | null
}

export interface LessonCreate {
  name: string
  teacher_id?: number | null
  hall_id?: number | null
  start_time: string
  duration_min: number
  price?: number
  total_spots?: number
  service_id?: number | null
  level?: string | null
  equipment?: string | null
}

// Записанный на занятие клиент (для попапа занятия)
export interface BookedClient {
  reservation_id: number
  client_id: number
  name: string
  last_name: string | null
  phone: string | null
  avatar_color: string | null
  spot_number: number | null
  status: 'active' | 'attended'
}

export interface LessonDetail extends Lesson {
  booked_clients: BookedClient[]
}

export interface Reservation {
  id: number
  client_id: number
  lesson_id: number
  spot_number: number | null
  status: 'active' | 'cancelled' | 'attended'
  booking_channel: string | null
  created_at: string
}
