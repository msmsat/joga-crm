import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import AmbientBackdrop from './home/AmbientBackdrop';
import { useTelegram } from '../hooks/useTelegram';

type Props = {
  /** Бросает ошибку, если бэкенд не принял данные — её показывает форма. */
  onSubmit: (name: string, phone: string) => Promise<void>;
  /** Имя из Telegram, если приложение открыли из бота. */
  defaultName?: string;
};

/**
 * Экран знакомства — единственный раз за всю жизнь устройства.
 *
 * Это не «вход»: пароля нет, восстанавливать нечего, поэтому и форма выглядит
 * не как логин, а как первая страница анкеты. Два поля, крупная типографика и
 * живой аватар, который набирается вместе с именем — знакомство должно читаться
 * как жест студии навстречу, а не как турникет перед расписанием.
 */
export default function Welcome({ onSubmit, defaultName = '' }: Props) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { t } = useTranslation();
  const { vibrateSuccess, vibrateError } = useTelegram();

  const initial = name.trim().charAt(0).toUpperCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    if (name.trim().length < 2) {
      setError(t('auth.name_error'));
      vibrateError();
      return;
    }
    // В phone лежат только цифры — «плюс» живёт отдельной меткой в поле.
    if (phone.length < 9) {
      setError(t('auth.phone_error'));
      vibrateError();
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      await onSubmit(name.trim(), `+${phone}`);
      vibrateSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
      vibrateError();
      setIsSending(false);
    }
  };

  const field =
    'w-full rounded-[18px] bg-card px-4 py-4 text-[15px] font-semibold text-card-foreground shadow-soft outline-none transition placeholder:font-medium placeholder:text-muted-foreground/60';

  return (
    <div className="relative min-h-[100dvh] overflow-y-auto bg-background">
      <AmbientBackdrop tint="#F9A08B" />

      <form onSubmit={submit} className="pt-safe flex min-h-[100dvh] flex-col px-6 pb-10">
        <div className="flex items-center gap-2 pt-5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-foreground">
            Velora
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="mt-[9vh] flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand shadow-brand"
        >
          {/* Аватар набирается вместе с именем: профиль появляется на глазах,
              а не «отправляется на сервер». Пока имени нет — знак студии. */}
          <AnimatePresence mode="wait" initial={false}>
            {initial ? (
              <motion.span
                key={initial}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className="text-[28px] font-extrabold leading-none text-brand-foreground"
              >
                {initial}
              </motion.span>
            ) : (
              <motion.svg
                key="mark"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand-foreground)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
              >
                <path d="M12 21c-4-2.5-6-5.6-6-9a6 6 0 0112 0c0 3.4-2 6.5-6 9z" />
                <path d="M12 21c4-2.5 6-5.6 6-9" opacity="0.45" />
                <circle cx="12" cy="11" r="2" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="pt-6"
        >
          <h1 className="text-[38px] font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground">
            {t('auth.title')}
          </h1>
          <p className="mt-2.5 max-w-[19rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground">
            {t('auth.subtitle')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-4 pt-8"
        >
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t('auth.name_label')}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.name_placeholder')}
              autoComplete="given-name"
              enterKeyHint="next"
              className={`${field} focus:ring-2 focus:ring-brand`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t('auth.phone_label')}
            </span>
            {/* «Плюс» — не символ в значении, а метка поля: его нельзя стереть,
                продублировать или поставить в середину, поэтому и чистить нечего.
                В состоянии живут только цифры, номер собирается при отправке. */}
            <div className={`${field} flex items-center gap-1.5 focus-within:ring-2 focus-within:ring-brand`}>
              <span className="select-none text-muted-foreground">+</span>
              <input
                value={phone}
                /* Вставка «+380 (67) 123-45-67» превращается в цифры прямо здесь —
                   ни пробел, ни буква, ни скобка в поле не доживают. */
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder={t('auth.phone_placeholder')}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                enterKeyHint="done"
                maxLength={15}
                className="w-full bg-transparent tabular-nums outline-none placeholder:font-medium placeholder:text-muted-foreground/60"
              />
            </div>
          </label>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pt-4 text-[12.5px] font-semibold text-danger"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Кнопка прижата к низу экрана, а поля остаются вверху: так большой
            палец дотягивается до действия, не перекрывая то, что заполняет. */}
        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pt-10"
        >
          <div className="flex items-start gap-2.5 pb-5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-brand)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[12px] font-medium leading-relaxed text-muted-foreground">
              {t('auth.note')}
            </span>
          </div>

          <motion.button
            type="submit"
            disabled={isSending}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="w-full rounded-[18px] bg-brand py-4 text-[15px] font-extrabold tracking-[-0.01em] text-brand-foreground shadow-brand disabled:opacity-60"
          >
            {isSending ? t('auth.submitting') : t('auth.submit')}
          </motion.button>
        </motion.div>
      </form>
    </div>
  );
}
