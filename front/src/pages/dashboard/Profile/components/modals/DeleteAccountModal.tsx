import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../../components/ui/index';
import { OtpConfirmModal } from '../../../Settings/components/modals/OtpConfirmModal';
import { authApi } from '../../../../../api';
import { clearActiveToken } from '../../../../../utils/auth';

interface Props {
  email: string;
  onClose: () => void;
}

// Регистр и пробелы расхождением не считаем — здесь сверяется намерение, а не
// адрес доставки; ровно так же сверяет сервер (routers/auth/profile.delete_me).
const norm = (value: string) => value.trim().toLowerCase();

/** Удаление личного аккаунта — то же двухшаговое подтверждение, что у опасной
 *  зоны студии: последствия и набранная рукой строка на шаге 1, код с почты на
 *  шаге 2 (OtpConfirmModal). Строка здесь — собственная почта: она же и есть
 *  то, что освободится. */
export function DeleteAccountModal({ email, onClose }: Props) {
  const { t } = useTranslation(['profile', 'settings']);
  const [confirmEmail, setConfirmEmail] = useState('');

  return (
    <OtpConfirmModal
      action="delete_user"
      title={t('profile:security.deleteAccount.title')}
      onClose={onClose}
      canContinue={Boolean(email) && norm(confirmEmail) === norm(email)}
      continueLabel={t('settings:security.otp.continue')}
      onConfirmed={async (otpToken) => {
        await authApi.deleteMe(confirmEmail, otpToken);
        // Аккаунта больше нет: токен мёртв, а кэш набит данными несуществующей
        // студии. Жёсткая перезагрузка, а не navigate, — иначе смонтированные
        // экраны успеют сходить за данными удалённого аккаунта и показать
        // ошибки вместо страницы регистрации.
        clearActiveToken();
        window.location.replace('/register');
      }}
      step1Body={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              t('profile:security.deleteAccount.warnAccount', { email }),
              t('profile:security.deleteAccount.warnStudios'),
              t('profile:security.deleteAccount.warnBilling'),
            ].map(line => (
              <li key={line} style={{ fontSize: '13px', color: 'var(--text2, #666)', lineHeight: 1.5 }}>{line}</li>
            ))}
          </ul>
          <Input
            label={t('settings:security.danger.confirmNameLabel', { name: email })}
            value={confirmEmail}
            onChange={setConfirmEmail}
            placeholder={email}
          />
        </div>
      }
    />
  );
}
