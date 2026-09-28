import { useEffect, useRef, useState } from 'react';
import type { PaymentCheckPreview } from '../../../../api/schedule/schedule.types';

/** Процент ручной скидки: целое 1…100, иначе null. */
export const percentOf = (value: string): number | null => {
  const n = Number(value);
  return /^\d{1,3}$/.test(value) && n >= 1 && n <= 100 ? n : null;
};

/** Что выбрал администратор в окне оплаты. */
export type PaymentChoice = {
  manual_percent: number | null;
  use_bonuses: boolean;
  use_deposit: boolean;
  first_lesson: boolean;
  promo_code: string | null;
  certificate_code: string | null;
};

type Options<P extends PaymentCheckPreview> = {
  /** Чек под выбор; null — считать пока не по чему (условия записи ещё не взяты). */
  load: ((choice: PaymentChoice) => Promise<P>) | null;
  /** Что, кроме выбора, меняет чек: бронь или условия записи. */
  scope: string;
  /** Скидка, с которой окно открывается (данная брони при записи). */
  initialManual?: number | null;
  /** Первое занятие решается снаружи: у новой записи оно берёт условия заново. */
  firstLesson?: { value: boolean; set: (value: boolean) => void };
};

/**
 * Чек оплаты занятия у стойки — один на оплату долга (useReservationPayment) и
 * оплату при записи (useQuotePayment): окно у них одно (components/lesson/PaySheet).
 *
 * Считает НЕ фронт: скидки (студии, оффер, приглашение, первое занятие,
 * промокод, ручная), сертификат, баллы и депозит отдаёт сервер — то же ядро
 * кассы, которым затем проведётся оплата. Здесь только выбор администратора и
 * какой чек на экране. Устаревший ответ (выбор успел смениться) отбрасывает
 * счётчик версий, а принять деньги можно только по чеку под НЫНЕШНИЙ выбор —
 * пока набранный код ждёт паузы, прежний чек на экране, но кнопка ждёт тоже.
 *
 * Промокод и ваучер применяются сами, без «Применить»: набрали и замолчали —
 * чек пересчитан. Код, который сервер не принял, в оплату не уходит.
 */
export function usePaymentCheck<P extends PaymentCheckPreview>({ load, scope, initialManual, firstLesson }: Options<P>) {
  const [manual, setManual] = useState(initialManual ? String(initialManual) : '');
  const [useBonuses, setUseBonuses] = useState(false);
  const [useDeposit, setUseDeposit] = useState(false);
  const [ownFirstLesson, setOwnFirstLesson] = useState(true);
  const [promo, setPromo] = useState('');
  const [voucher, setVoucher] = useState('');
  const [preview, setPreview] = useState<{ key: string; result: P } | null>(null);
  const [loading, setLoading] = useState(load != null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  // Загрузчик — новая функция на каждый рендер; чек зависит от scope и выбора.
  const loader = useRef(load);
  useEffect(() => { loader.current = load; });
  const active = load != null;

  const manualPercent = percentOf(manual);
  const manualInvalid = manual !== '' && manualPercent == null;
  const first = firstLesson?.value ?? ownFirstLesson;
  const choice: PaymentChoice = {
    manual_percent: manualPercent,
    use_bonuses: useBonuses,
    use_deposit: useDeposit,
    first_lesson: first,
    promo_code: promo.trim() || null,
    certificate_code: voucher.trim() || null,
  };
  const key = `${scope}|${JSON.stringify(choice)}`;
  const typing = manual !== '' || choice.promo_code != null || choice.certificate_code != null;

  // Чек идёт за выбором: переключили баллы — пересчитали. Поля ждут паузы в
  // наборе, иначе «1» на пути к «15» и каждая буква кода слали бы запрос.
  useEffect(() => {
    if (manualInvalid || !active) return;
    const current = ++version.current;
    const sent = JSON.parse(key.slice(key.indexOf('|') + 1)) as PaymentChoice;
    // Таймер и для первого чека: синхронный setState в теле эффекта линтер
    // запрещает, а ждать пользователь всё равно не заметит.
    const timer = window.setTimeout(() => {
      const run = loader.current;
      if (!run) return;
      setLoading(true);
      setFailed(false);
      run(sent)
        .then(result => { if (current === version.current) setPreview({ key, result }); })
        .catch(() => { if (current === version.current) setFailed(true); })
        .finally(() => { if (current === version.current) setLoading(false); });
    }, typing ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [key, manualInvalid, typing, attempt, active]);

  const shown = active ? preview?.result ?? null : null;
  return {
    preview: shown, loading: active && loading, failed, manual, manualPercent, manualInvalid,
    useBonuses, useDeposit, firstLesson: first, promo, voucher,
    /** Чек есть и посчитан под нынешний выбор — можно принимать деньги. */
    ready: shown != null && preview?.key === key && !loading && !failed && !manualInvalid,
    // В поле только цифры: на телефоне там цифровая клавиатура, а вставленное
    // «10 %» не должно превращаться в ошибку.
    setManual: (value: string) => setManual(value.replace(/\D/g, '').slice(0, 3)),
    setUseBonuses, setUseDeposit, setPromo, setVoucher,
    setFirstLesson: firstLesson?.set ?? setOwnFirstLesson,
    retry: () => setAttempt(n => n + 1),
    /** Что уйдёт в оплату: выбор и итог, который видел администратор. Код,
     *  который сервер не принял, не уходит: касса отказала бы (промокод) или
     *  посчитала бы не тот итог (ваучер). Проигравший промокод тоже не шлём —
     *  он ничего не снимает, а засчитался бы клиенту как использованный. */
    request: () => ({
      ...choice,
      promo_code: shown?.promo_valid && !shown.promo_outweighed ? choice.promo_code : null,
      certificate_code: shown?.certificate_error ? null : choice.certificate_code,
      expected_total: shown?.total,
    }),
  };
}

export type PaymentCheck = ReturnType<typeof usePaymentCheck<PaymentCheckPreview>>;
