import { useState, useCallback } from 'react';
import i18n from '../../../../i18n';

export interface ClientFormState {
  name:  string;
  phone: string;
  email: string;
  /** Ник без «@» — поле рисует «@» само, сервер хранит голый ник. */
  instagram: string;
  bday:  string;
  city:  string;
  note:  string;
  tags:  string[];
  membershipId: number | null;
  isMembershipPaid: boolean;
  inviteCode: string;
}

type FormErrors = Partial<Record<keyof ClientFormState, string>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Те же правила, что у сервера (back/contact_format.INSTAGRAM_NICK). */
export const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/;

/** Вставленную ссылку на профиль и «@» снимаем сразу — в форме живёт голый ник. */
export function instagramNick(value: string): string {
  return value
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .split('?')[0]
    .replace(/\/+$/, '')
    .replace(/^@+/, '');
}

const DEFAULTS: ClientFormState = {
  name: '', phone: '', email: '', instagram: '',
  bday: '', city: '',  note: '',
  tags: [], membershipId: null, isMembershipPaid: false,
  inviteCode: '',
};

export function useClientForm() {
  const [form,   setFormState] = useState<ClientFormState>({ ...DEFAULTS });
  const [errors, setErrors]    = useState<FormErrors>({});

  const set = useCallback(<K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) => {
    setFormState(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }, []);

  const validate = useCallback((step: 1 | 2): boolean => {
    const stepErrors: FormErrors = {};
    if (step === 1) {
      stepErrors.name  = (!form.name.trim() || form.name.trim().length < 2)
        ? i18n.t('clients:addModal.errors.name') : undefined;
      stepErrors.phone = (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 6)
        ? i18n.t('clients:addModal.errors.phone') : undefined;
      stepErrors.email = (!form.email.trim() || !EMAIL_RE.test(form.email.trim()))
        ? i18n.t('clients:addModal.errors.email') : undefined;
      // Instagram необязателен, но заполненный мусор ловим здесь, а не 422-м
      // на четвёртом шаге, когда форму уже не видно.
      stepErrors.instagram = (form.instagram && !INSTAGRAM_RE.test(form.instagram))
        ? i18n.t('clients:addModal.errors.instagram') : undefined;
    } else {
      stepErrors.city = !form.city.trim() ? i18n.t('clients:addModal.errors.city') : undefined;
    }
    setErrors(e => ({ ...e, ...stepErrors }));
    return Object.values(stepErrors).every(v => !v);
  }, [form]);

  const reset = useCallback(() => {
    setFormState({ ...DEFAULTS });
    setErrors({});
  }, []);

  return { form, errors, set, validate, reset };
}
