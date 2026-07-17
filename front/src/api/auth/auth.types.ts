export interface LoginPayload {
  identifier: string
  password: string
}

export interface RegisterPayload {
  email: string
  name: string
  password: string
}

export interface GoogleAuthPayload {
  token: string
}

export interface VerifyEmailPayload {
  email: string
  code: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ResetPasswordPayload {
  email: string
  code: string
  new_password: string
}

export interface WorkingHoursPayload {
  dayOfWeek: number
  isOpen: boolean
  openTime: string
  closeTime: string
}

export interface OnboardingPayload {
  studioName: string
  description?: string | null
  logoUrl?: string | null
  activityType: string
  phone: string
  address?: string | null
  email?: string | null
  website?: string | null
  timezone: string
  language: string
  currency: string
  dateFormat?: string
  firstDayOfWeek?: string
  workingHours?: WorkingHoursPayload[]
}

export interface TokenResponse {
  access_token: string
  token_type: string
  message?: string
}

export interface UserMe {
  name: string
  last_name: string | null
  email: string | null
  phone: string | null
  is_onboarded: boolean
  studio_id: number | null
  role: string | null
}

export interface UpdateProfilePayload {
  name?: string
  last_name?: string | null
  phone?: string | null
}

export interface CheckPhoneResponse {
  taken: boolean
}
