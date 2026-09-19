import type { TFunction } from 'i18next';

// Older servers return plain text. Keep these exact aliases during rolling deployments.
const LEGACY_CODES: Record<string, string> = {
  'Неверный email, телефон или пароль': 'invalid_credentials',
  'Аккаунт ещё не активирован. Примите приглашение по ссылке из письма или подтвердите email кодом.': 'account_not_verified',
  'Неверный или истёкший код': 'invalid_code',
  'Неверный или истёкший код подтверждения': 'invalid_code',
  'Пользователь с таким email уже зарегистрирован': 'email_taken',
  'Неверный текущий пароль': 'invalid_current_password',
  'Новый пароль должен отличаться от текущего': 'password_unchanged',
};

export function serverErrorText(data: unknown, t: TFunction): string {
  const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : undefined;
  let message = '';
  let code = '';
  if (typeof detail === 'string') {
    message = detail;
    code = LEGACY_CODES[detail] ?? (/^[a-z0-9_.]+$/.test(detail) ? detail : '');
  } else if (Array.isArray(detail)) {
    // Pydantic diagnostics are technical English, not localized form messages.
    return t('common:errors.invalid_request');
  } else if (detail && typeof detail === 'object') {
    if ('code' in detail && typeof detail.code === 'string') code = detail.code;
    if ('message' in detail && typeof detail.message === 'string') message = detail.message;
  }
  if (code === 'subscription_expired') return t('billing:banner.unpaid');
  if (code === 'billing.suspended') return t('billing:banner.suspended');
  if (code === 'email_taken') return t('common:validation.emailTaken');
  if (code === 'invalid_google_token') return t('common:auth.googleFailed');
  if (/^[a-z0-9_.]+$/.test(code)) {
    const translated = t(`common:errors.${code}`, { defaultValue: '' });
    if (translated) return translated;
  }
  return message || t('common:errors.unknown');
}
