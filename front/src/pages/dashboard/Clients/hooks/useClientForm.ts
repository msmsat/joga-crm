import { useState, useCallback } from 'react';
import i18n from '../../../../i18n';

export interface ClientFormState {
  name:  string;
  phone: string;
  email: string;
  /** Ник без «@» — поле рисует «@» само, сервер хранит голый ник. */
  instagram: string;
  bday:  string;
  /** null — поле не трогали, в нём стоит город по IP; '' — очистили намеренно. */
  city:  string | null;
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
  bday: '', city: null,  note: '',
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

  /** Обязательно только имя. Остальное проверяется, лишь если его заполнили:
      мусор ловим здесь, а не 422-м после нажатия «Добавить». */
  const validate = useCallback((): boolean => {
    const email = form.email.trim();
    const next: FormErrors = {
      name:      form.name.trim() ? undefined : i18n.t('clients:addModal.errors.name'),
      phone:     form.phone && !/^\+[1-9]\d{7,14}$/.test(form.phone) ? i18n.t('clients:addModal.errors.phone') : undefined,
      email:     email && !EMAIL_RE.test(email) ? i18n.t('clients:addModal.errors.email') : undefined,
      instagram: form.instagram && !INSTAGRAM_RE.test(form.instagram) ? i18n.t('clients:addModal.errors.instagram') : undefined,
    };
    setErrors(e => ({ ...e, ...next }));
    return Object.values(next).every(v => !v);
  }, [form]);

  const reset = useCallback(() => {
    setFormState({ ...DEFAULTS });
    setErrors({});
  }, []);

  return { form, errors, set, validate, reset };
}
