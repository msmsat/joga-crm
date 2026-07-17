import { client } from '../client'
import type {
  CheckPhoneResponse,
  ForgotPasswordPayload,
  GoogleAuthPayload,
  LoginPayload,
  OnboardingPayload,
  RegisterPayload,
  ResetPasswordPayload,
  TokenResponse,
  UpdateProfilePayload,
  UserMe,
  VerifyEmailPayload,
} from './auth.types'

export const authApi = {
  login: (payload: LoginPayload) =>
    client.post<TokenResponse>('/auth/login', payload, { auth: false }),

  register: (payload: RegisterPayload) =>
    client.post<void>('/auth/register', payload, { auth: false }),

  verifyEmail: (payload: VerifyEmailPayload) =>
    client.post<TokenResponse>('/auth/verify-email', payload, { auth: false }),

  google: (payload: GoogleAuthPayload) =>
    client.post<TokenResponse>('/auth/google', payload, { auth: false }),

  forgotPassword: (payload: ForgotPasswordPayload) =>
    client.post<void>('/auth/forgot-password', payload, { auth: false }),

  resetPassword: (payload: ResetPasswordPayload) =>
    client.post<void>('/auth/reset-password', payload, { auth: false }),

  getMe: (signal?: AbortSignal) =>
    client.get<UserMe>('/auth/me', { signal }),

  updateMe: (payload: UpdateProfilePayload) =>
    client.patch<UserMe>('/auth/me', payload),

  checkPhone: (phone: string) =>
    client.get<CheckPhoneResponse>(`/auth/check-phone?phone=${encodeURIComponent(phone)}`),

  onboarding: (payload: OnboardingPayload) =>
    client.post<TokenResponse>('/auth/onboarding', payload),
}
