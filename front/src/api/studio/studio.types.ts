export interface UploadLogoResponse {
  url: string
}

export interface StudioRead {
  id: number
  name: string
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  logo_url: string | null
  business_type: string | null
  description: string | null
  timezone: string
  language: string
  currency: string
  date_format: string
  first_day_of_week: string
}

export interface StudioUpdate {
  name?: string
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  description?: string | null
  timezone?: string
  language?: string
  currency?: string
  date_format?: string
  first_day_of_week?: string
}

export interface BranchCreate {
  name: string
  phone?: string | null
  email?: string | null
  country?: string | null
  city?: string | null
  address?: string | null
  photo_url?: string | null
}

export interface BranchUpdate {
  name?: string
  phone?: string | null
  email?: string | null
  country?: string | null
  city?: string | null
  address?: string | null
  photo_url?: string | null
  working_hours?: WorkingHoursRead[]
}

export interface BranchListItem {
  id: number
  name: string
  address: string | null
  city: string | null
  country: string | null
  hall_count: number
}

export interface HallCreate {
  name: string
  capacity?: number
  area?: number | null
  color?: string | null
  equipment?: string[] | null
  hourly_rate?: number | null
  is_online?: boolean
  photo_url?: string | null
}

export interface HallUpdate {
  name?: string
  capacity?: number
  area?: number | null
  color?: string | null
  equipment?: string[] | null
  hourly_rate?: number | null
  is_online?: boolean
  photo_url?: string | null
}

export interface HallBrief {
  id: number
  name: string
  capacity: number
  color: string | null
  area: number | null
  hourly_rate: number | null
  equipment: string[] | null
  is_online: boolean
  photo_url: string | null
}

export interface WorkingHoursRead {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
}

export interface BranchDetail {
  id: number
  name: string
  country: string | null
  city: string | null
  phone: string | null
  email: string | null
  address: string | null
  photo_url: string | null
  halls: HallBrief[]
  working_hours: WorkingHoursRead[]
}
