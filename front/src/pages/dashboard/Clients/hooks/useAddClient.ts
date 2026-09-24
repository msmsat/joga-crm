import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { EMAIL_RE, useClientForm } from './useClientForm';
import type { ClientFormState } from './useClientForm';
import { useClientMutations } from './useClientsList';
import { clientsApi } from '../../../../api/clients/clients.api';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../api/queryKeys';
import { ApiError } from '../../../../api/client';
import { errorMessage } from '../../../../api/errorMessage';
import { useContactCheck } from '../../../../hooks/useContactCheck';
import { useToast } from '../../../../components/ui/Toast';
import { phoneCountry } from '../../../../components/UI';

/** Всё, что знает форма «Новый клиент», — общее для мастера на большом экране
    и одной прокручиваемой формы на телефоне. */
export function useAddClient(isOpen: boolean, onDone: (form: ClientFormState) => void) {
  const { t } = useTranslation('clients');
  const toast = useToast();
  const mutations = useClientMutations();
  const { form, errors, set, validate } = useClientForm();
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  const { data: packages = [] } = useQuery({
    queryKey: queryKeys.packages,
    queryFn: () => loyaltyApi.getSubscriptionPackages(),
    enabled: isOpen,
  });
  const activePackages = packages.filter(p => p.is_active);
  const selectedPackage = activePackages.find(p => p.id === form.membershipId) ?? null;

  // Город по IP администратора: подставляется, пока поле не трогали.
  const { data: place } = useQuery({
    queryKey: queryKeys.clientDefaultCity,
    queryFn: () => clientsApi.getDefaultCity(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const defaultCity = place?.city ?? '';
  const city = form.city ?? defaultCity;
  const cityIsAuto = form.city === null && !!defaultCity && place?.source === 'ip';

  // Телефон и email не должны повторяться в студии — спрашиваем сервер на лету;
  // пока проверка идёт или контакт занят, добавить клиента нельзя.
  const phoneCheck = useContactCheck('client', 'phone', form.phone, {
    enabled: isOpen && /^\+[1-9]\d{7,14}$/.test(form.phone),
  });
  const emailCheck = useContactCheck('client', 'email', form.email, {
    enabled: isOpen && EMAIL_RE.test(form.email.trim()),
  });
  const contactsBlocked = phoneCheck.taken || emailCheck.taken || phoneCheck.checking || emailCheck.checking;
  const canSubmit = isOpen && !!form.name.trim() && !contactsBlocked && !saving;

  const submit = () => {
    if (submitting.current || !canSubmit || !validate()) return false;
    submitting.current = true;
    setSaving(true);
    mutations.create({
      name:               form.name.trim(),
      phone:              form.phone || null,
      email:              form.email.trim() || null,
      instagram:          form.instagram.trim() || null,
      city:               city.trim() || null,
      birth_date:         form.bday || null,
      tags:               form.tags.length ? form.tags : undefined,
      note:               form.note.trim() || null,
      membership_id:      form.membershipId,
      is_membership_paid: form.membershipId !== null ? form.isMembershipPaid : false,
      invite_code:        form.inviteCode.trim() || null,
    }).then(({ id }) => {
      // Номер — то, по чему клиента теперь найдут всегда, даже без контактов.
      toast.success(`${t('toasts.clientAdded')} · #${id}`);
      onDone(form);
    }).catch((err) => {
      submitting.current = false;
      setSaving(false);
      // Лимит тарифа (403 limit_exceeded) уже показывает глобальная модалка апселла — не дублируем.
      if (err instanceof ApiError && err.code === 'limit_exceeded') return;
      // Форму не закрываем и данные не теряем — видно, что пошло не так.
      toast.error(errorMessage(err, t));
    });
    return true;
  };

  return {
    form, errors, set, validate, submit, saving, canSubmit,
    city, cityIsAuto, phoneDefaultCountry: phoneCountry(place?.country),
    phoneCheck, emailCheck, contactsBlocked,
    activePackages, selectedPackage,
  };
}

export type AddClientState = ReturnType<typeof useAddClient>;
