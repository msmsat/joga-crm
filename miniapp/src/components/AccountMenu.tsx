import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { accountId, clearSession, getAccounts, getSession, saveSession, type Session } from '../lib/session';
import { cn } from '../lib/utils';

type Props = {
  userName?: string;
  /** Вход ещё одним аккаунтом: экран входа поднимает App — под живой сессией
   *  сверка кода обязана идти без Bearer (см. api/auth.ts, `anon`). */
  onAddAccount: () => void;
};

/**
 * Аккаунт внизу бокового меню.
 *
 * Карточка не ведёт в профиль: профиль стоит отдельным пунктом выше, и второй
 * вход в тот же раздел не даёт ничего. Здесь живёт то, чего в меню нет, —
 * переключение между аккаунтами устройства (своя карточка и карточка ребёнка,
 * личная и рабочая почта) и выход.
 *
 * Панель раскрывается ВВЕРХ константой, а не замером как в LanguagePopover:
 * карточка приклеена к низу колонки (mt-auto), места под ней не бывает никогда.
 *
 * Переключение перезагружает страницу, а не разбирает состояние по кускам:
 * расписание, абонемент, лояльность и профиль загружены под старый токен, и
 * ровно так же (reload) на смену токена уже отвечает api/client.ts на 401.
 */
export default function AccountMenu({ userName, onAddAccount }: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // pointerdown, а не click: панель должна уходить в тот же момент, когда
    // палец коснулся страницы, — тот же приём, что и в LanguagePopover.
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // Список читаем только на открытии: меняется он через reload, так что
  // держать его в состоянии и синхронизировать нечего.
  const activeId = accountId(getSession()?.token ?? '');
  const others = isOpen ? getAccounts().filter((a) => accountId(a.token) !== activeId) : [];

  const pick = (account: Session) => {
    saveSession(account);
    window.location.reload();
  };

  const logout = () => {
    clearSession();
    // Остались другие аккаунты — выход из этого не должен выкидывать на экран
    // входа: кабинет продолжается под следующим.
    const next = getAccounts()[0];
    if (next) saveSession(next);
    window.location.reload();
  };

  const initial = (name?: string) => (name || 'A').charAt(0).toUpperCase();

  return (
    <div ref={anchor} className="relative mt-auto">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="group flex w-full min-w-0 items-center gap-3 rounded-[18px] bg-card px-3.5 py-3.5 text-left shadow-soft transition-shadow duration-200 hover:shadow-lift"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-extrabold text-brand-foreground">
          {initial(userName)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-card-foreground">
          {userName || t('profile.guest')}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--v-muted-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
            isOpen ? 'rotate-180' : 'group-hover:-translate-y-0.5',
          )}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label={t('account.title')}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 origin-bottom rounded-[20px] bg-card p-1.5 shadow-lift"
          >
            {others.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('account.saved')}
                </div>
                {others.map((account) => (
                  <button
                    key={accountId(account.token)}
                    type="button"
                    role="menuitem"
                    onClick={() => pick(account)}
                    className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/14 text-[11px] font-extrabold text-brand">
                      {initial(account.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground/80">
                      {account.name}
                    </span>
                  </button>
                ))}
              </>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onAddAccount();
              }}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-[-0.01em] text-foreground">
                {t('account.add')}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-muted-foreground)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-muted-foreground">
                {t('account.logout')}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
