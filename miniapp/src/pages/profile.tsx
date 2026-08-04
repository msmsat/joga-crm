import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SupportModal from '../components/modals/SupportModal';
import HistoryModal from '../components/modals/HistoryModal';
import BuyModal from '../components/modals/BuyModal';
import LanguageModal from '../components/modals/LanguageModal';
import SubscriptionCard from '../components/profile/SubscriptionCard';
import SettingRow from '../components/profile/SettingRow';
import { SectionLabel } from '../components/ui/SectionLabel';
import { useTelegram } from '../hooks/useTelegram';
import {
  getUserProfile,
  getUserSubscription,
  updateNotifications,
  updateReminders,
  type UserProfile,
  type UserSubscription,
} from '../api/user';

const tg = (window as any).Telegram?.WebApp;

export default function Profile() {
  const [notifs, setNotifs] = useState(true);
  const [reminders, setReminders] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const { tg_id } = useTelegram(); // Берем ID из нашего хука
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [isLoadingSub, setIsLoadingSub] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { t } = useTranslation();
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const closeSupportModal = () => setIsSupportModalOpen(false);
  const closeHistoryModal = () => setIsHistoryModalOpen(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoadingProfile(true);
      try {
        const data = await getUserProfile(tg_id);
        setProfile(data);
        setNotifs(data.notifs_enabled);
        setReminders(data.reminders_enabled);
      } catch (error) {
        console.error('Помилка завантаження профілю:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    const fetchSubscriptionData = async () => {
      setIsLoadingSub(true);
      try {
        const subData = await getUserSubscription(tg_id);
        setSubscriptions(subData); // Якщо абонемента немає, повернеться null
      } catch (error) {
        console.error('Помилка завантаження абонемента:', error);
      } finally {
        setIsLoadingSub(false);
      }
    };

    fetchProfileData();
    fetchSubscriptionData();
  }, [tg_id, refreshTick]);

  const toggleNotifs = async () => {
    const newVal = !notifs;
    setNotifs(newVal); // Оптимістичний UI: миттєво перемикаємо
    if (tg) tg.HapticFeedback.impactOccurred('light');

    try {
      await updateNotifications(tg_id, newVal);
    } catch (e) {
      setNotifs(!newVal); // Відкат, якщо виникла помилка інтернету
      console.error(e);
    }
  };

  // 🔥 5. Обробка натискання на перемикач "Нагадування"
  const toggleReminders = async () => {
    const newVal = !reminders;
    setReminders(newVal); // Оптимістичний UI
    if (tg) tg.HapticFeedback.impactOccurred('light');

    try {
      await updateReminders(tg_id, newVal);
    } catch (e) {
      setReminders(!newVal); // Відкат при помилці
      console.error(e);
    }
  };

  const openSupportModal = () => {
    setIsSupportModalOpen(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');
  };

  const openHistoryModal = () => {
    setIsHistoryModalOpen(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');
  };

  const openBuyModal = () => {
    setIsBuyModalOpen(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');
  };

  const closeBuyModal = () => setIsBuyModalOpen(false);

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText('https://jogaua.online/invite') // Сюда впишешь реальную реф. ссылку
      .then(() => {
        setIsCopied(true); // Включаем галочку
        if (tg) tg.HapticFeedback.notificationOccurred('success'); // Дзынь! (вибрация успеха)

        // Через 2 секунды возвращаем иконку копирования
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => console.error('Помилка копіювання: ', err));
  };

  const openInstagram = () => {
    const url = 'https://www.instagram.com/sadovskiy_matvii_/';
    if (tg && tg.openLink) {
      tg.openLink(url); // Открывает внутри Telegram
    } else {
      window.open(url, '_blank'); // Обычный браузер
    }
    if (tg) tg.HapticFeedback.impactOccurred('light');
  };

  const openLanguageModal = () => {
    setIsLanguageModalOpen(true);
    if (tg) tg.HapticFeedback.impactOccurred('light');
  };

  const avatarLetter = profile?.name ? profile.name.charAt(0).toUpperCase() : 'А';

  const activeSub = subscriptions.find((s) => s.status === 'active');
  const queuedSubs = subscriptions.filter((s) => s.status === 'waiting');

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="pt-safe px-5"
      >
        <div className="flex items-center gap-4 pt-9">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-[24px] font-extrabold text-brand-foreground shadow-brand">
            {avatarLetter}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-foreground">
              {isLoadingProfile ? t('profile.loading') : profile?.name || t('profile.guest')}
            </h1>
            <p className="mt-1 truncate text-[12.5px] font-medium text-muted-foreground">
              {isLoadingProfile
                ? t('profile.searching_data')
                : t('profile.in_studio_since', {
                    date: profile?.reg_date_str || t('profile.recently'),
                  })}
            </p>
          </div>
        </div>
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
              ? t('profile.expires', { date: activeSub.expires_str || activeSub.expires_at })
              : undefined
          }
          unitLabel={t('common.classes_count')}
          isLoading={isLoadingSub}
          loadingLabel={t('profile.checking_subs')}
          emptyTitle={t('profile.no_sub')}
          emptyHint={t('profile.buy_sub_hint')}
          onBuy={openBuyModal}
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

      <SectionLabel>{t('profile.settings')}</SectionLabel>

      <div className="flex flex-col gap-2 px-5">
        <SettingRow
          accent
          label={t('profile.buy_btn')}
          onClick={openBuyModal}
          icon={<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z M3 6h18 M16 10a4 4 0 01-8 0" />}
        />

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

        <SettingRow
          label={t('profile.history')}
          onClick={openHistoryModal}
          icon={
            <>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </>
          }
        />

        <SettingRow
          label={t('profile.invite')}
          onClick={handleCopyLink}
          icon={
            <>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </>
          }
          trailing={
            isCopied ? (
              <motion.svg
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-success)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <polyline points="20 6 9 17 4 12" />
              </motion.svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-muted-foreground)"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )
          }
        />

        <SettingRow
          label={t('profile.support')}
          onClick={openSupportModal}
          icon={<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />}
        />

        <SettingRow
          label={t('profile.about_studio')}
          onClick={openInstagram}
          icon={
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
            </>
          }
        />

        <SettingRow
          label={t('profile.language', 'Мова')}
          onClick={openLanguageModal}
          icon={
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </>
          }
        />
      </div>

      {/* МОДАЛКИ */}
      <SupportModal isOpen={isSupportModalOpen} onClose={closeSupportModal} />
      <HistoryModal isOpen={isHistoryModalOpen} onClose={closeHistoryModal} />
      <BuyModal
        isOpen={isBuyModalOpen}
        onClose={closeBuyModal}
        onSuccess={() => setRefreshTick((prev) => prev + 1)}
      />
      {/* 🔥 НАША НОВАЯ МОДАЛКА ЯЗЫКА */}
      <LanguageModal isOpen={isLanguageModalOpen} onClose={() => setIsLanguageModalOpen(false)} />
    </>
  );
}
