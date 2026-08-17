import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';
import { setMyPhone } from '../../api/user';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Номер сохранён — вызывающий повторяет запись, ради которой его спросили. */
  onSaved: () => void;
  layer?: number;
}

/**
 * «Оставьте номер» — предусловие записи с оплатой на месте.
 *
 * В Telegram номер отдаёт сам Telegram: одна кнопка, нативный запрос,
 * подписанный ответ. Ни кода, ни SMS — подпись проверяет сервер тем же
 * секретом, которым проверяет вход. Старые клиенты Telegram подписанного
 * ответа не возвращают (метод появился в Bot API 8.0), поэтому под кнопкой
 * всегда лежит ручной ввод — он же единственный путь в браузере.
 */
export default function PhoneSheet({ isOpen, onClose, onSaved, layer = 1 }: Props) {
  const { t } = useTranslation();
  const { tg, isInTelegram, vibrateSuccess, vibrateError } = useTelegram();
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (data: { contact_data: string } | { phone: string }) => {
    setIsSaving(true);
    setError('');
    try {
      await setMyPhone(data);
      setIsSaving(false);
      vibrateSuccess();
      onSaved();
    } catch (e) {
      setIsSaving(false);
      setError(e instanceof Error ? e.message : t('phoneSheet.error'));
      vibrateError();
    }
  };

  const shareViaTelegram = () => {
    // Ответ приходит вторым аргументом только на Bot API 8.0+. Нет его — не
    // ошибка: человек просто дозаполнит поле ниже, ради этого оно и открыто.
    tg?.requestContact?.((ok, result) => {
      if (ok && result?.response) save({ contact_data: result.response });
    });
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      kicker={t('phoneSheet.kicker')}
      title={t('phoneSheet.title')}
      footer={
        <SheetAction
          onClick={() => save({ phone: phone.trim() })}
          disabled={isSaving || phone.trim().length < 6}
        >
          {isSaving ? t('phoneSheet.saving') : t('phoneSheet.save')}
        </SheetAction>
      }
    >
      <div className="text-[13px] font-medium leading-relaxed text-muted-foreground">
        {t('phoneSheet.hint')}
      </div>

      {isInTelegram && tg?.requestContact && (
        <button
          type="button"
          onClick={shareViaTelegram}
          disabled={isSaving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] bg-brand px-4 py-3.5 text-[14px] font-extrabold text-brand-foreground shadow-brand disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          {t('phoneSheet.share')}
        </button>
      )}

      <input
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t('phoneSheet.placeholder')}
        disabled={isSaving}
        autoComplete="tel"
        className="mt-3 w-full rounded-[16px] bg-background px-4 py-3.5 text-[14px] font-semibold text-foreground outline-none ring-1 ring-inset ring-transparent transition placeholder:font-medium placeholder:text-muted-foreground/70 focus:ring-brand/50 disabled:opacity-50"
      />

      {error && (
        <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-danger">{error}</div>
      )}
    </Sheet>
  );
}
