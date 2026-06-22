import { useState, useCallback } from 'react';

export interface ClientFormState {
  name:  string;
  phone: string;
  email: string;
  bday:  string;
  city:  string;
  note:  string;
  tags:  string[];
  abMax: number;
}

type FormErrors = Partial<Record<keyof ClientFormState, string>>;

const DEFAULTS: ClientFormState = {
  name: '', phone: '', email: '',
  bday: '', city: '',  note: '',
  tags: [], abMax: 10,
};

export function useClientForm() {
  const [form,   setFormState] = useState<ClientFormState>({ ...DEFAULTS });
  const [errors, setErrors]    = useState<FormErrors>({});

  const set = useCallback(<K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) => {
    setFormState(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim() || form.name.trim().length < 2) {
      next.name = 'Введите имя (минимум 2 символа)';
    }
    if (form.phone && form.phone.replace(/\D/g, '').length < 6) {
      next.phone = 'Некорректный номер телефона';
    }
    if (form.email && !form.email.includes('@')) {
      next.email = 'Некорректный email';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const reset = useCallback(() => {
    setFormState({ ...DEFAULTS });
    setErrors({});
  }, []);

  return { form, errors, set, validate, reset };
}
