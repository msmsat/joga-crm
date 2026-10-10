import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PastLessonResponse, UpcomingLessonResponse } from '../../../api/lessons';
import PaidBadge from '../../payment/PaidBadge';
import { paymentState } from './paymentState';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

type Props = {
  lesson: MyLesson;
  isPast: boolean;
  /** Сервер разрешил оплату картой сейчас (`allowed_actions` содержит `pay`). */
  payable: boolean;
  paying: boolean;
  onPay: () => void;
  /** Stripe ещё подтверждает оплату этой брони — форму второй раз не открываем. */
  awaiting: boolean;
  checking: boolean;
  onCheck?: () => void;
};

const ICONS: Record<string, ReactNode> = {
  venue: (
    <>
      <path d="M3 21h18M5 21V9l7-5 7 5v12" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  subscription: (
    <>
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 5v12" strokeDasharray="2 2.2" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
      <path d="M12 9v11.5M3.5 13h17M12 9S10.5 4.5 8 4.5a2.25 2.25 0 0 0 0 4.5h4zm0 0s1.5-4.5 4-4.5a2.25 2.25 0 0 1 0 4.5h-4z" />
    </>
  ),
  check: <path d="m5.5 12.5 4 4 9-9" />,
};

/** Строка способа: значок, что это, пояснение и сумма справа. */
function MethodLine({ icon, title, hint, amount, tone = 'neutral' }: {
  icon: ReactNode; title: string; hint?: string; amount?: string; tone?: 'neutral' | 'debt' | 'good';
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          tone === 'debt' ? 'bg-danger/14 text-danger' : tone === 'good' ? 'bg-success/18 text-success' : 'bg-card text-foreground shadow-soft',
        ].join(' ')}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
          {icon}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-extrabold leading-tight tracking-[-0.015em] text-foreground">{title}</div>
        {hint && <div className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground">{hint}</div>}
      </div>
      {amount && (
        <div className="shrink-0 text-[19px] font-extrabold tracking-[-0.03em] tabular-nums text-foreground">{amount}</div>
      )}
    </div>
  );
}

/**
 * Чек оплаты занятия: чем платите и — если можно — «оплатить сейчас».
 *
 * Главный случай ради которого блок существует: человек записался «оплачу на
 * месте», а потом решил закрыть это картой заранее. Способ «в студии» здесь
 * не переключатель, который ничего не делает до оплаты, а факт: долг открыт,
 * и единственное действие, меняющее способ, — сама оплата. Под линией отрыва
 * — кнопка на ту же сумму и обещание, что у стойки платить не придётся.
 *
 * Разрешение платить решает сервер (`pay` в `allowed_actions`): занятие уже
 * началось, студия не принимает карты, запись ждёт одобрения — кнопки нет,
 * а чек объясняет, где и когда платить.
 */
export default function LessonPayment({ lesson, isPast, payable, paying, onPay, awaiting, checking, onCheck }: Props) {
  const { t } = useTranslation();
  const state = paymentState(lesson);
  const cancelled = lesson.status === 'cancelled';

  if (lesson.payment_review) return (
    <section aria-label={t('lessonSheet.pay.label')} className="rounded-[22px] bg-background p-4" role="status">
      <MethodLine icon={ICONS.card} title={t('lessonSheet.pay.review_title')} hint={t('lessonSheet.pay.review_hint')} tone="debt" />
    </section>
  );
  if (state === 'paid_online') return <PaidBadge detail />;
  // У отменённой брони без онлайн-оплаты рассказывать про оплату нечего.
  if (cancelled) return null;

  const cta = (label: string, amount?: string) => (
    <motion.button
      type="button"
      onClick={onPay}
      disabled={paying}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-[18px] bg-brand px-4 py-3.5 text-left text-brand-foreground shadow-brand disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A]/10">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          {ICONS.card}
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-[-0.01em]">
        {paying ? t('lessonSheet.pay.opening') : label}
      </span>
      {amount && !paying && (
        <span className="shrink-0 text-[15px] font-extrabold tabular-nums">{amount}</span>
      )}
    </motion.button>
  );

  const secure = (
    <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <rect x="5" y="11" width="14" height="9.5" rx="2" />
        <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      </svg>
      {t('lessonSheet.pay.secure')}
    </div>
  );

  let body: ReactNode;
  if (state === 'hold' || awaiting) {
    body = (
      <>
        <MethodLine
          icon={ICONS.card}
          title={t(awaiting ? 'payment.sync.awaiting' : 'lessonSheet.pay.hold_title')}
          hint={t(awaiting ? 'payment.sync.verifying' : 'lessonSheet.pay.hold_hint')}
          tone="debt"
        />
        {(payable && !awaiting) || onCheck ? <div className="lesson-receipt-tear my-4" /> : null}
        {payable && !awaiting && <>{cta(t('lessonSheet.pay.resume'))}{secure}</>}
        {onCheck && (
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            className="mt-3 w-full rounded-[14px] py-2.5 text-[13px] font-bold text-foreground underline decoration-foreground/25 underline-offset-4 disabled:opacity-55"
          >
            {t(checking ? 'payment.sync.checking' : 'lessonSheet.pay.already_paid')}
          </button>
        )}
      </>
    );
  } else if (state === 'venue') {
    const pending = lesson.status === 'pending';
    body = (
      <>
        <MethodLine
          icon={ICONS.venue}
          title={t(isPast ? 'lessonSheet.pay.venue_unpaid' : 'lessonSheet.pay.venue_title')}
          hint={t(pending ? 'lessonSheet.pay.venue_after_approval' : payable ? 'lessonSheet.pay.venue_hint' : 'lessonSheet.pay.venue_desk')}
          amount={lesson.debt_str}
          tone={isPast ? 'debt' : 'neutral'}
        />
        {payable && (
          <>
            <div className="lesson-receipt-tear my-4" />
            <p className="mb-3 text-[12.5px] font-medium leading-relaxed text-muted-foreground">
              {t('lessonSheet.pay.switch_hint')}
            </p>
            {cta(t('lessonSheet.pay.by_card'), lesson.debt_str)}
            {secure}
          </>
        )}
      </>
    );
  } else {
    const facts = {
      subscription: { icon: ICONS.subscription, title: 'lessonSheet.pay.subscription', hint: 'lessonSheet.pay.subscription_hint' },
      trial: { icon: ICONS.gift, title: 'mylessons.trial', hint: 'lessonSheet.pay.trial_hint' },
      free: { icon: ICONS.gift, title: 'lessonSheet.pay.free', hint: undefined },
      paid: { icon: ICONS.check, title: 'lessonSheet.pay.paid', hint: 'lessonSheet.pay.paid_hint' },
    }[state];
    body = (
      <MethodLine icon={facts.icon} title={t(facts.title)} hint={facts.hint ? t(facts.hint) : undefined} tone="good" />
    );
  }

  return (
    <section aria-label={t('lessonSheet.pay.label')} className="rounded-[22px] bg-background p-4">
      {body}
    </section>
  );
}
