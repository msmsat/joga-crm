import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LoyaltyCard from '../components/club/LoyaltyCard';
import LevelLadder from '../components/club/LevelLadder';
import DepositSheet from '../components/club/DepositSheet';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Press } from '../components/ui/Press';
import { useTelegram } from '../hooks/useTelegram';
import type { LoyaltyOverview } from '../api/loyalty';

interface ClubProps {
  /** null — снимок ещё грузится в App вместе с каталогом студии. */
  data: LoyaltyOverview | null;
}

/**
 * «Клуб» — раздел лояльности глазами клиента.
 *
 * Порядок блоков — по тому, как часто их открывают: карта с баллами, лестница
 * уровней, что можно потратить прямо сейчас (скидки, сертификаты, депозит),
 * приглашение друга и в самом низу история начислений.
 *
 * Каждый блок появляется, только если за ним есть данные: студия без
 * сертификатов не должна видеть заголовок «Сертифікати» с пустотой под ним.
 * Единственный блок без условия — карта: она есть у всех, кто вообще попал
 * в этот раздел (сам раздел прячется в навигации, если программа выключена).
 */
export default function Club({ data }: ClubProps) {
  const { t, i18n } = useTranslation();
  const { tg, vibrateLight } = useTelegram();

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!data) {
    return (
      <>
        <ScreenHeader title={t('club.title')} />
        <div className="pt-8">
          <ListSkeleton rows={3} />
        </div>
      </>
    );
  }

  // Программа выключена владельцем. В навигации пункта в этом случае нет, но
  // выключить её могли и после того, как клиент открыл раздел.
  if (!data.enabled) {
    return (
      <>
        <ScreenHeader title={t('club.title')} />
        <EmptyState
          title={t('club.disabled')}
          hint={t('club.disabled_hint')}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </>
          }
        />
      </>
    );
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  const copy = (text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedCode(key);
        if (tg) tg.HapticFeedback.notificationOccurred('success');
        setTimeout(() => setCopiedCode(null), 2000);
      })
      .catch((err) => console.error('Помилка копіювання: ', err));
  };

  const referral = data.referral;

  return (
    <>
      <ScreenHeader kicker={data.program_name} title={t('club.title')} />

      <div className="pt-6 dt:pt-10">
        <LoyaltyCard data={data} />
      </div>

      {data.levels.length > 0 && (
        <>
          <SectionLabel>{t('club.levels')}</SectionLabel>
          <LevelLadder levels={data.levels} />
        </>
      )}

      {/* Персональные скидки: реальные объекты из БД (ClientOffer), выданные
          сценарием или владельцем вручную, а не рекламное обещание. */}
      {data.offers.length > 0 && (
        <>
          <SectionLabel trailing={`${data.offers.length}`}>{t('club.offers')}</SectionLabel>
          <div className="flex flex-col gap-2 px-5">
            {data.offers.map((offer, i) => (
              <motion.div
                key={`${offer.discount_type}-${offer.value}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-4 rounded-[18px] bg-card px-4 py-4 shadow-soft ring-1 ring-inset ring-brand/25"
              >
                <span className="shrink-0 text-[20px] font-extrabold tabular-nums tracking-[-0.03em] text-brand">
                  {offer.label}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] font-medium text-muted-foreground">
                  {offer.valid_until
                    ? t('club.valid_until', { date: formatDate(offer.valid_until) })
                    : t('club.valid_forever')}
                </span>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Сертификаты — только активные и только этого клиента. Код можно
          скопировать: назвать его администратору проще, чем переписывать. */}
      {data.certificates.length > 0 && (
        <>
          <SectionLabel trailing={`${data.certificates.length}`}>
            {t('club.certificates')}
          </SectionLabel>
          <div className="flex flex-col gap-2 px-5">
            {data.certificates.map((cert, i) => (
              <motion.div
                key={cert.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <Press
                  onClick={() => copy(cert.code, cert.code)}
                  role="button"
                  tabIndex={0}
                  className="flex cursor-pointer items-center gap-4 rounded-[18px] bg-card px-4 py-4 shadow-soft transition-shadow duration-300 dt:hover:shadow-lift"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold tabular-nums tracking-[-0.025em] text-card-foreground">
                      {cert.amount_str}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11.5px] font-bold tracking-[0.08em] text-muted-foreground">
                      {copiedCode === cert.code ? t('club.code_copied') : cert.code}
                    </span>
                  </span>

                  {cert.expires_at && (
                    <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                      {t('club.valid_until', { date: formatDate(cert.expires_at) })}
                    </span>
                  )}
                </Press>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Депозит показываем только тем, у кого он есть: у большинства студий
          этой механики нет вовсе, и пустой блок «0 ₴» был бы шумом. */}
      {data.deposit_balance > 0 && (
        <>
          <SectionLabel>{t('club.deposit')}</SectionLabel>
          <div className="px-5">
            <Press
              onClick={() => {
                setIsDepositOpen(true);
                vibrateLight();
              }}
              role="button"
              tabIndex={0}
              className="group flex cursor-pointer items-center gap-4 rounded-[18px] bg-card px-4 py-4 shadow-soft transition-shadow duration-300 dt:hover:shadow-lift"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[20px] font-extrabold tabular-nums tracking-[-0.03em] text-card-foreground">
                  {data.deposit_balance_str}
                </span>
                <span className="mt-1 block text-[11.5px] font-medium text-muted-foreground">
                  {t('club.deposit_history')}
                </span>
              </span>

              <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform duration-300 dt:group-hover:translate-x-1">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Press>
          </div>
        </>
      )}

      {/* Реферальная программа — только если владелец её включил, и только
          числами из его же конфига: бонус приглашающему и скидка новичку. */}
      {referral && (
        <>
          <SectionLabel>{t('club.referral')}</SectionLabel>
          <div className="px-5">
            <div className="rounded-[20px] bg-card p-5 shadow-soft dt:p-6">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-brand/12 px-3 py-1.5 text-[11.5px] font-extrabold text-brand">
                  {referral.bonus_type === 'points'
                    ? t('club.referral_bonus_points', { bonus: referral.referrer_bonus })
                    : t('club.referral_bonus_money', { bonus: referral.referrer_bonus_str })}
                </span>
                {referral.new_client_discount > 0 && (
                  <span className="rounded-full bg-muted px-3 py-1.5 text-[11.5px] font-bold text-muted-foreground">
                    {t('club.referral_discount', { discount: referral.new_client_discount })}
                  </span>
                )}
              </div>

              <div className="mt-4 flex gap-6">
                <div>
                  <div className="text-[20px] font-extrabold tabular-nums tracking-[-0.03em] text-card-foreground">
                    {referral.invited_count}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('club.referral_invited')}
                  </div>
                </div>
                <div>
                  <div className="text-[20px] font-extrabold tabular-nums tracking-[-0.03em] text-card-foreground">
                    {referral.completed_count}
                  </div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('club.referral_completed')}
                  </div>
                </div>
              </div>

              {/* Ссылку собирает сервер: без подключённого бота её нет, и
                  кнопка, ведущая в никуда, здесь была бы враньём. */}
              {referral.invite_link && (
                <button
                  type="button"
                  onClick={() => copy(referral.invite_link as string, 'referral')}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] bg-brand py-3.5 text-[13.5px] font-extrabold text-brand-foreground shadow-brand"
                >
                  {copiedCode === 'referral' ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('club.referral_copied')}
                    </>
                  ) : (
                    t('club.referral_copy')
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <SectionLabel>{t('club.history')}</SectionLabel>
      {data.history.length === 0 ? (
        <EmptyState
          size="sm"
          title={t('club.no_history')}
          hint={t('club.no_history_hint')}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-2 px-5">
          {data.history.map((entry, i) => (
            <motion.div
              key={`${entry.created_at}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(i, 8) * 0.035, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-[18px] bg-card px-4 py-3.5 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-card-foreground">
                  {entry.description}
                </div>
                <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {formatDate(entry.created_at)}
                </div>
              </div>

              {/* Знак несёт смысл, поэтому он остаётся у числа, а цвет только
                  помогает: списание — пыльная роза, начисление — фисташка. */}
              <div
                className={`shrink-0 text-[14px] font-extrabold tabular-nums tracking-[-0.01em] ${
                  entry.points < 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {entry.points > 0 ? `+${entry.points}` : entry.points}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <DepositSheet isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} />
    </>
  );
}
