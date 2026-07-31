import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api';
import { queryKeys } from '../api/queryKeys';
import { errorMessage } from '../api/errorMessage';
import { useMe } from '../hooks/useMe';
import { PhoneField } from './UI';
import { ModalShell, ModalBody, ModalFooter, PrimaryButton } from './ui/index';

// Гейт на телефон аккаунта. Аккаунт в продукте — это email И телефон
// (docs/ROADMAP_ACCOUNTS): email приходит с регистрации, а телефона может не
// быть вовсе — вход через Google его не спрашивает, а телефон студии из
// онбординга принадлежит бизнесу, а не человеку.
//
// Поэтому спрашиваем один раз здесь, при входе в кабинет, а не в пяти формах:
// сотрудник задаёт номер на /join, все остальные — тут. Закрыть нельзя (Esc и
// клик мимо выключены): иначе аккаунт так и остаётся без второго контакта.
export default function PhoneGate() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { t } = useTranslation('common');

  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => authApi.updateMe({ phone }),
    onSuccess: (updated) => qc.setQueryData(queryKeys.me, updated),
    // Занят другим аккаунтом (409) — единственная реальная ошибка: телефон
    // глобально уникален, как и email.
    onError: (err) => setError(errorMessage(err, t)),
  });

  if (!me || me.phone) return null;

  const canSave = phone.replace(/\D/g, '').length >= 8 && !save.isPending;

  return (
    <ModalShell onClose={() => {}} dismissible={false} closeOnBackdrop={false}>
      <ModalBody>
        <div style={{
          width: '52px', height: '52px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(252,174,145,0.32)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>

        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text, #1A1A1A)', letterSpacing: '-0.6px', margin: '0 0 6px' }}>
            {t('phoneGate.title')}
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--muted, #666)', margin: 0, lineHeight: 1.6 }}>
            {t('phoneGate.sub')}
          </p>
        </div>

        <PhoneField
          label={t('fields.phone')}
          value={phone}
          onChange={(v: string | undefined) => { setPhone(v || ''); setError(''); }}
          error={error || undefined}
        />
      </ModalBody>

      <ModalFooter>
        <PrimaryButton onClick={() => save.mutate()} disabled={!canSave} loading={save.isPending}>
          {t('buttons.save')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
