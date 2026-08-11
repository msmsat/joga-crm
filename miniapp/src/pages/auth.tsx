import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import AmbientBackdrop from '../components/home/AmbientBackdrop';
import { Press } from '../components/ui/Press';
import {
  getStudioBrand, requestEmailCode, verifyEmailCode,
  type StudioBrand, type UserResponse,
} from '../api/auth';
import { applyBranding, applyDefaultLanguage } from '../lib/branding';

/**
 * Вход в кабинет клиента вне Telegram — по коду на почту.
 *
 * Два шага в одном экране: почта → код. Регистрация и вход неразличимы для
 * человека: он вводит адрес, а поле «Имя» появляется на втором шаге, только
 * если такого клиента у студии ещё нет (`is_new` из /auth/email/request).
 * Пароля нет вовсе — заводить его значило бы добавить экран восстановления
 * ради того, что уже решает одноразовый код.
 *
 * Тот же экран работает режимом привязки (`linkMode`): под живой сессией
 * бэкенд не логинит, а записывает подтверждённую почту текущему клиенту —
 * так телеграмная карточка получает вход из браузера, а не двойника.
 *
 * И он же — вход вторым аккаунтом из меню (`anonymous`): сессия на устройстве
 * жива, поэтому сверку кода шлём без Bearer, иначе сработала бы та самая
 * привязка. `onCancel` тут обязателен по смыслу — человек передумал, и текущий
 * кабинет должен вернуться на место.
 */
export default function Auth({
  studioId,
  referralCode,
  linkMode = false,
  anonymous = false,
  onDone,
  onCancel,
}: {
  studioId: number;
  referralCode?: string;
  linkMode?: boolean;
  anonymous?: boolean;
  onDone: (user: UserResponse, token: string) => void;
  onCancel?: () => void;
}) {
  const [brand, setBrand] = useState<StudioBrand | null>(null);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Витрина студии — единственное, что можно показать до входа. Провал не
    // блокирует форму: шапка останется нейтральной, войти всё равно можно.
    getStudioBrand(studioId)
      .then((data) => {
        setBrand(data);
        // Фирменный цвет и тёмная тема — с первого экрана: логинится клиент
        // уже в кабинет своей студии, а не в нейтральный персиковый Velora.
        applyBranding(data.accent_color, data.dark_mode);
        applyDefaultLanguage(data.language);
      })
      .catch(() => {});
  }, [studioId]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    try {
      const { is_new } = await requestEmailCode(studioId, email.trim());
      // В режиме привязки имя не спрашиваем никогда: карточка уже существует,
      // и переименовывать её подтверждением почты нечестно.
      setNeedsName(is_new && !linkMode);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося надіслати код');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await verifyEmailCode(
        {
          studio_id: studioId,
          email: email.trim(),
          code: code.trim(),
          name: needsName ? name.trim() : undefined,
          referral_code: referralCode,
        },
        anonymous,
      );
      onDone(user, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Невірний код');
      setBusy(false);
    }
  };

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const codeValid = code.trim().length === 6 && (!needsName || name.trim().length > 0);

  const hint = linkMode
    ? 'Підтвердьте пошту — і зможете заходити в цей самий кабінет із браузера, не лише з Telegram.'
    : step === 'code'
      ? `Код надіслано на ${email.trim()}`
      : anonymous
        ? 'Введіть пошту іншого акаунта — надішлемо код. Поточний вхід залишиться на цьому пристрої.'
        : 'Введіть пошту — надішлемо код для входу. Пароль не потрібен.';

  return (
    /* На телефоне форма живёт прямо на фоне — карточка в карточке там лишний
       кадр. На десктопе наоборот: одинокая колонка полей посреди 1440px
       выглядит брошенной, поэтому вход собирается в карточку по центру. */
    /* Своего фона у контейнера нет намеренно: подложка со светом студии стоит
       на -z-10, и любая заливка родителя закрасила бы её целиком (фон страницы
       приходит из body — index.css). */
    <div className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden px-7 py-12 dt:items-center">
      <AmbientBackdrop tint={brand?.accent_color ?? '#F9A08B'} />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative dt:w-full dt:max-w-[460px] dt:rounded-[28px] dt:bg-card dt:p-12 dt:shadow-lift"
      >
        {brand?.logo_url ? (
          <img
            src={brand.logo_url}
            alt=""
            className="mb-6 h-14 w-14 rounded-2xl object-cover shadow-soft"
          />
        ) : (
          <div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-brand"
            style={{ background: brand?.accent_color ?? '#F9A08B' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="1.7"
                 strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M12 21c-4-2.5-6-5.6-6-9a6 6 0 0112 0c0 3.4-2 6.5-6 9z" />
              <circle cx="12" cy="11" r="2" />
            </svg>
          </div>
        )}

        <h1 className="text-[28px] font-extrabold leading-[1.06] tracking-[-0.03em] text-foreground dt:text-[32px]">
          {linkMode ? 'Прив’язати пошту' : anonymous ? 'Інший акаунт' : brand?.name ?? 'Кабінет клієнта'}
        </h1>
        <p className="mt-2.5 max-w-[20rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground dt:text-[14px]">
          {hint}
        </p>

        <div className="mt-7 space-y-3">
          {step === 'email' ? (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && emailValid && !busy && submitEmail()}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] font-medium text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-brand focus:shadow-brand"
            />
          ) : (
            <>
              {needsName && (
                <input
                  type="text"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Як вас звати?"
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] font-medium text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-brand focus:shadow-brand"
                />
              )}
              <input
                ref={codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && codeValid && !busy && submitCode()}
                placeholder="000000"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-[22px] font-extrabold tracking-[0.4em] text-foreground outline-none transition-shadow placeholder:tracking-[0.4em] placeholder:text-muted-foreground/40 focus:border-brand focus:shadow-brand"
              />
            </>
          )}

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-1 text-[12.5px] font-semibold text-danger"
            >
              {error}
            </motion.p>
          )}

          <Press>
            <button
              disabled={busy || (step === 'email' ? !emailValid : !codeValid)}
              onClick={step === 'email' ? submitEmail : submitCode}
              className="w-full rounded-2xl bg-brand py-3.5 text-[15px] font-extrabold text-brand-foreground shadow-brand transition-opacity disabled:opacity-40"
            >
              {busy ? '…' : step === 'email' ? 'Надіслати код' : linkMode ? 'Прив’язати' : 'Увійти'}
            </button>
          </Press>

          {step === 'code' && (
            <button
              onClick={() => { setStep('email'); setCode(''); setError(null); }}
              className="w-full py-2 text-[12.5px] font-semibold text-muted-foreground"
            >
              Змінити пошту
            </button>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-2 text-[12.5px] font-semibold text-muted-foreground"
            >
              Скасувати
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
