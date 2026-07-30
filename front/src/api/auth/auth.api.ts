import { client } from '../client'
import type {
  AcceptInvitePayload,
  ChangePasswordPayload,
  ContactCheckResponse,
  ContactField,
  InviteInfo,
  ForgotPasswordPayload,
  GoogleAuthPayload,
  Login2FAPayload,
  LoginPayload,
  OnboardingPayload,
  OtpAction,
  OtpRequestResponse,
  OtpVerifyResponse,
  RegisterPayload,
  ResetPasswordPayload,
  StudioListItem,
  TokenResponse,
  UpdateProfilePayload,
  UserMe,
  VerifyEmailPayload,
} from './auth.types'

export const authApi = {
  login: (payload: LoginPayload) =>
    client.post<TokenResponse>('/auth/login', payload, { auth: false }),

  login2fa: (payload: Login2FAPayload) =>
    client.post<TokenResponse>('/auth/login/2fa', payload, { auth: false }),

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

  // Приглашение сотрудника (/join?token=…). Обе ручки публичные: права даёт сам
  // токен из письма, поэтому auth: false — иначе чужой токен в localStorage
  // ушёл бы в заголовке и бэк отвечал бы про не ту личность.
  getInvite: (token: string) =>
    client.get<InviteInfo>(`/auth/invite?token=${encodeURIComponent(token)}`, { auth: false }),

  acceptInvite: (payload: AcceptInvitePayload) =>
    client.post<TokenResponse>('/auth/invite/accept', payload, { auth: false }),

  getMe: (signal?: AbortSignal) =>
    client.get<UserMe>('/auth/me', { signal }),

  updateMe: (payload: UpdateProfilePayload) =>
    client.patch<UserMe>('/auth/me', payload),

  // Занят ли контакт другим аккаунтом продукта (свой не считается) — онбординг, профиль.
  checkContact: (field: ContactField, value: string) =>
    client.get<ContactCheckResponse>(
      `/auth/check-contact?field=${field}&value=${encodeURIComponent(value)}`
    ),

  onboarding: (payload: OnboardingPayload) =>
    client.post<TokenResponse>('/auth/onboarding', payload),

  // EPIC 7: мультистудийность — список студий пользователя, переключение между ними
  // и создание доп. студии тем же мастером (/onboarding?new=1 — задача 5).
  getStudios: () =>
    client.get<StudioListItem[]>('/auth/studios'),

  selectStudio: (studioId: number) =>
    client.post<TokenResponse>('/auth/select-studio', { studio_id: studioId }),

  createStudio: (payload: OnboardingPayload) =>
    client.post<TokenResponse>('/auth/studios', payload),

  // EPIC 5, задача 3: единый OTP-механизм для опасных действий внутри аккаунта.
  requestOtp: (action: OtpAction) =>
    client.post<OtpRequestResponse>('/auth/otp/request', { action }),

  verifyOtp: (action: OtpAction, code: string) =>
    client.post<OtpVerifyResponse>('/auth/otp/verify', { action, code }),

  changePassword: (payload: ChangePasswordPayload, otpToken: string) =>
    client.post<{ message: string }>('/auth/change-password', payload, {
      headers: { 'X-OTP-Token': otpToken },
    }),

  logoutCurrentSession: () =>
    client.delete<void>('/auth/sessions/current'),
}
