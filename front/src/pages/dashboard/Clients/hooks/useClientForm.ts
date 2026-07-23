import { useState, useCallback } from 'react';
import i18n from '../../../../i18n';

export interface ClientFormState {
  name:  string;
  phone: string;
  email: string;
  bday:  string;
  city:  string;
  note:  string;
  tags:  string[];
  membershipId: number | null;
  isMembershipPaid: boolean;
  inviteCode: string;
}

type FormErrors = Partial<Record<keyof ClientFormState, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULTS: ClientFormState = {
  name: '', phone: '', email: '',
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
