import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SupportModal from '../components/modals/SupportModal';
import HistoryModal from '../components/modals/HistoryModal';
import BuyModal from '../components/modals/BuyModal';
import LanguageModal from '../components/modals/LanguageModal';
import SubscriptionCard from '../components/profile/SubscriptionCard';
import SettingRow from '../components/profile/SettingRow';
import AmbientBackdrop from '../components/home/AmbientBackdrop';
import { SectionLabel } from '../components/ui/SectionLabel';
import { EmptyState } from '../components/ui/EmptyState';
import { useTelegram } from '../hooks/useTelegram';
import {
  getUserProfile,
  getUserSubscription,
  updateNotifications,
  updateReminders,
  type UserProfile,
  type UserSubscription,
} from '../api/user';
import type { StudioCatalog } from '../api/studio';

interface ProfileProps {
  catalog: StudioCatalog | null;
}

export default function Profile({ catalog }: ProfileProps) {
  const { t, i18n } = useTranslation();
  const { tg, vibrateLight } = useTelegram();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingSub, setIsLoadingSub] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [notifs, setNotifs] = useState(true);
  const [reminders, setReminders] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoadingProfile(true);
      setProfileError(null);
      try {
        const data = await getUserProfile();
        setProfile(data);
        setNotifs(data.notifs_enabled);
        setReminders(data.reminders_enabled);
      } catch (error) {
        console.error('Помилка завантаження профілю:', error);
        setProfileError(error instanceof Error ? error.message : t('profile.load_error'));
      } finally {
        setIsLoadingProfile(false);
      }
    };

    const fetchSubscriptionData = async () => {
      setIsLoadingSub(true);
      setSubError(null);
      try {
        setSubscriptions(await getUserSubscription());
      } catch (error) {
        console.error('Помилка завантаження абонемента:', error);
        setSubError(error instanceof Error ? error.message : t('profile.sub_load_error'));
      } finally {
        setIsLoadingSub(false);
      }
    };

    fetchProfileData();
    fetchSubscriptionData();
  }, [refreshTick, t]);

  const toggleNotifs = async () => {
    const next = !notifs;
    setNotifs(next); // Оптимистично: тумблер не должен ждать сеть
    vibrateLight();
    try {
      await updateNotifications(next);
    } catch (error) {
      setNotifs(!next);
      console.error(error);
    }
  };

  const toggleReminders = async () => {
    const next = !reminders;
    setReminders(next);
    vibrateLight();
    try {
      await updateReminders(next);
    } catch (error) {
      setReminders(!next);
      console.error(error);
    }
  };

  const handleCopyLink = () => {
    const botUsername = catalog?.studio.bot_username;
    if (!botUsername || !profile?.invite_code) return;

    navigator.clipboard
      .writeText(`https://t.me/${botUsername}?startapp=s${catalog!.studio.id}_ref${profile.invite_code}`)
      .then(() => {
        setIsCopied(true);
        if (tg) tg.HapticFeedback.notificationOccurred('success');
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => console.error('Помилка копіювання: ', err));
  };

  const openInstagram = () => {
    const url = 'https://www.instagram.com/sadovskiy_matvii_/';
    if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, '_blank');
    vibrateLight();
  };

  const open = (setter: (value: boolean) => void) => () => {
    setter(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');
  };

  const avatarLetter = profile?.name ? profile.name.charAt(0).toUpperCase() : 'A';
  const activeSub = subscriptions.find((s) => s.status === 'active');
  const queuedSubs = subscriptions.filter((s) => s.status === 'pending');

  // Профиль не загрузился — дальше показывать нечего: имя, абонемент,
  // настройки, всё завязано на него. Честная ошибка вместо тихого "Гостя".
  if (!isLoadingProfile && profileError) {
    return (
      <div className="relative flex min-h-[70dvh] items-center justify-center">
        <AmbientBackdrop tint={catalog?.studio.accent_color ?? '#F9A08B'} />
        <EmptyState
          title={t('profile.load_error')}
          hint={profileError}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <AmbientBackdrop tint={catalog?.studio.accent_color ?? '#F9A08B'} />

      {/* Шапка профиля: аватар в двойном кольце — это единственный портрет во
          всём приложении, и он должен читаться как оправа, а не как иконка. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="pt-safe flex flex-col items-center px-5 pt-10 text-center"
      >
        <div className="relative flex h-[92px] w-[92px] items-center justify-center">
          <motion.span
            animate={{ scale: [1, 1.06, 1], opacity: [0.35, 0.15, 0.35] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full bg-brand/30"
          />
          <span className="absolute inset-[7px] rounded-full ring-1 ring-brand/40" />
          <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full bg-brand text-[26px] font-extrabold text-brand-foreground shadow-brand">
            {avatarLetter}
          </span>
        </div>

        <h1 className="mt-5 max-w-full truncate text-[28px] font-extrabold leading-tight tracking-[-0.035em] text-foreground">
          {isLoadingProfile ? t('profile.loading') : profile?.name || t('profile.guest')}
        </h1>
        <p className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">
          {isLoadingProfile
            ? t('profile.searching_data')
            : t('profile.in_studio_since', {
                date: profile?.registration_date
                  ? new Date(profile.registration_date).toLocaleDateString(i18n.language, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : t('profile.recently'),
              })}
        </p>
      </motion.div>

      <div className="pt-8">
        <SubscriptionCard
          label={t('profile.current_sub')}
          name={
            activeSub
              ? t(`subscription.${activeSub.type}.name`, { defaultValue: activeSub.type })
              : undefined
          }
          left={activeSub?.classes_left}
          total={activeSub?.total_classes}
          expires={
            activeSub
              ? t(activeSub.is_frozen ? 'profile.frozen' : 'profile.expires', {
                  date: new Date(activeSub.expires_at).toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  }),
                })
              : undefined
          }
          unitLabel={t('common.classes_count')}
          isLoading={isLoadingSub}
          loadingLabel={t('profile.checking_subs')}
          emptyTitle={subError ? t('profile.sub_load_error') : t('profile.no_sub')}
          emptyHint={subError ?? t('profile.buy_sub_hint')}
          onBuy={open(setIsBuyOpen)}
        />
      </div>

      {!isLoadingSub && queuedSubs.length > 0 && (
        <>
          <SectionLabel trailing={`${queuedSubs.length}`}>{t('profile.queue')}</SectionLabel>
          <div className="flex flex-col gap-2 px-5">
            {queuedSubs.map((sub, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between gap-3 rounded-[18px] bg-card px-4 py-3.5 shadow-soft"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-bold text-card-foreground">
                    {t(`subscription.${sub.type}.name`, { defaultValue: sub.type })}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                    {t('profile.auto_activates')}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-brand/12 px-3 py-1.5 text-[11px] font-extrabold tabular-nums text-brand">
                  {sub.total_classes}
                </span>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Спільнота: приглашение — не строка настроек, а отдельная карточка с
          собственной иллюстрацией. Это единственное место, где клиент делает
          что-то не для себя, и оно должно выглядеть как приглашение, а не пункт
          списка. */}
      <SectionLabel>{t('profile.community')}</SectionLabel>
      <div className="px-5">
        <motion.button
          type="button"
          onClick={handleCopyLink}
          whileTap={{ scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="relative flex w-full items-center gap-4 overflow-hidden rounded-[22px] bg-card p-5 text-left shadow-soft"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-brand/10"
          />

          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/12">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </span>

          <span className="relative min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-card-foreground">
              {t('profile.invite')}
            </span>
            <span className="mt-1 block text-[11.5px] font-medium leading-relaxed text-muted-foreground">
              {isCopied ? t('home.referral_link_copied') : t('profile.invite_hint')}
            </span>
          </span>

          {isCopied ? (
            <motion.svg
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-success)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative h-5 w-5 shrink-0"
            >
              <polyline points="20 6 9 17 4 12" />
            </motion.svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="relative h-4 w-4 shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </motion.button>
      </div>

      <SectionLabel>{t('profile.subscription_group')}</SectionLabel>
      <div className="flex flex-col gap-2 px-5">
        <SettingRow
          accent
          label={t('profile.buy_btn')}
          onClick={open(setIsBuyOpen)}
          icon={<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z M3 6h18 M16 10a4 4 0 01-8 0" />}
        />
        <SettingRow
          label={t('profile.history')}
          onClick={open(setIsHistoryOpen)}
          icon={
            <>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </>
          }
        />
      </div>

      <SectionLabel>{t('profile.notifications_group')}</SectionLabel>
      <div className="flex flex-col gap-2 px-5">
        <SettingRow
          label={t('profile.notifications')}
          onClick={toggleNotifs}
          toggle
          checked={notifs}
          icon={<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />}
        />
        <SettingRow
          label={t('profile.reminders')}
          onClick={toggleReminders}
          toggle
          checked={reminders}
          icon={
            <>
              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />
              <circle cx="12" cy="10" r="3" />
            </>
          }
        />
      </div>

      <SectionLabel>{t('profile.app_group')}</SectionLabel>
      <div className="flex flex-col gap-2 px-5">
        <SettingRow
          label={t('profile.support')}
          onClick={open(setIsSupportOpen)}
          icon={<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />}
        />
        <SettingRow
          label={t('profile.about_studio')}
          onClick={openInstagram}
          icon={
            <>
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" />
            </>
          }
        />
        <SettingRow
          label={t('profile.language', 'Мова')}
          onClick={open(setIsLanguageOpen)}
          icon={
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </>
          }
        />
      </div>

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <BuyModal
        isOpen={isBuyOpen}
        onClose={() => setIsBuyOpen(false)}
        onSuccess={() => setRefreshTick((tick) => tick + 1)}
        packages={catalog?.packages ?? []}
      />
      <LanguageModal isOpen={isLanguageOpen} onClose={() => setIsLanguageOpen(false)} />
    </div>
  );
}
