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
  access_token: string | null
  token_type: string
  message?: string
  two_fa_required?: boolean
  two_fa_identifier?: string | null
}

export interface Login2FAPayload {
  identifier: string
  code: string
}

export interface UserMe {
  name: string
  last_name: string | null
  email: string | null
  phone: string | null
  tg_id: number | null
  is_onboarded: boolean
  studio_id: number | null
  role: string | null
  two_fa_enabled: boolean
}

export interface UpdateProfilePayload {
  name?: string
  last_name?: string | null
  phone?: string | null
  tg_id?: number | null
}

export interface CheckPhoneResponse {
  taken: boolean
}

// EPIC 5: единый OTP-механизм — action скопирован из схемы бэкенда (schemas/auth/otp.py).
export type OtpAction = 'change_password' | 'delete_data' | 'delete_account' | 'enable_2fa' | 'login_2fa'

export interface OtpRequestResponse {
  expires_in: number
}

export interface OtpVerifyResponse {
  otp_token: string
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}
