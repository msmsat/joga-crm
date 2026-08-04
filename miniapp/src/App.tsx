import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/home';
import Shedule from './pages/shedule';
import MyLessons from './pages/mylessons';
import Profile from './pages/profile';
import BottomNav from './components/BottomNav';
import AmbientBackdrop from './components/home/AmbientBackdrop';
import { authTelegram, type UserResponse } from './api/auth';
import { getStudioCatalog, type StudioCatalog } from './api/studio';
import { useTelegram } from './hooks/useTelegram';
import { getSession, saveSession, clearSession } from './lib/session';
import './App.css';

/**
 * `start_param` приходит из deep link `t.me/<bot>?startapp=s<studio_id>` —
 * например `s42` для студии 42, или `s42_refABC123` для реферальной ссылки
 * (код всегда хвостом после студии, ведущий `s<id>` не задет).
 */
function parseStudioId(startParam: string | undefined): number | null {
  if (!startParam) return null;
  const match = /^s(\d+)/.exec(startParam);
  return match ? Number(match[1]) : null;
}

function parseReferralCode(startParam: string | undefined): string | undefined {
  if (!startParam) return undefined;
  const match = /_ref([A-Za-z0-9]+)$/.exec(startParam);
  return match ? match[1] : undefined;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { tg } = useTelegram();

  const [user, setUser] = useState<UserResponse | null>(null);
  const [catalog, setCatalog] = useState<StudioCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Приложение открыли не из Telegram (нет initData) либо без deep-link на
  // студию (нет start_param) — валидного способа авторизоваться нет.
  const [needsTelegram, setNeedsTelegram] = useState(false);

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const boot = async () => {
      // Токен уже сохранён — доверяем ему сразу, без похода на бэкенд:
      // эндпоинта на валидацию токена нет, а если он всё же протух, первый
      // же авторизованный запрос поймает 401 и client.ts сам сбросит сессию
      // (см. api/client.ts).
      const session = getSession();
      if (session?.token) {
        // Полного профиля тут ещё нет — из downstream-страниц используется
        // только .name (home.tsx), остальное подтянется из /global/me, когда
        // экраны его запросят (профиль уже это делает).
        setUser({ name: session.name } as UserResponse);
      } else {
        const initData: string | undefined = tg?.initData;
        const studioId = parseStudioId(tg?.initDataUnsafe?.start_param);

        if (!initData || !studioId) {
          setNeedsTelegram(true);
          setIsLoading(false);
          return;
        }

        try {
          const { token, user: authedUser } = await authTelegram({
            init_data: initData,
            studio_id: studioId,
            referral_code: parseReferralCode(tg?.initDataUnsafe?.start_param),
          });
          saveSession({ token, name: authedUser.name });
          setUser(authedUser);
        } catch (error) {
          console.error('Помилка авторизації через Telegram:', error);
          // На случай, если в сторадже лежал протухший токен.
          clearSession();
          setNeedsTelegram(true);
          setIsLoading(false);
          return;
        }
      }

      // Один снимок каталога студии на весь сеанс — филиалы/послуги/пакеты
      // не меняются настолько часто, чтобы держать их за TanStack Query
      // (эпик прямо отказывается от неё, см. "Явно НЕ делаем").
      try {
        setCatalog(await getStudioCatalog());
      } catch (error) {
        console.error('Не вдалося завантажити дані студії:', error);
      }
      setIsLoading(false);
    };

    boot();
  }, []);

  const switchTab = (tab: string) => {
    if (tg) tg.HapticFeedback.impactOccurred('light');
    setActiveTab(tab);
  };

  // 4️⃣ ПОКА ИДЕТ ЗАПРОС К БАЗЕ ДАННЫХ — ПОКАЗЫВАЕМ ЗАГЛУШКУ-ЛОАДЕР
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-background">
        <motion.span
          animate={{ scale: [1, 1.18, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="h-3 w-3 rounded-full bg-brand"
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Налаштування простору
        </span>
      </div>
    );
  }

  if (needsTelegram) {
    return (
      <div className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-8 text-center">
        <AmbientBackdrop tint="#F9A08B" />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand shadow-brand"
        >
          <svg
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
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="pt-6"
        >
          <h1 className="text-[26px] font-extrabold leading-[1.08] tracking-[-0.03em] text-foreground">
            Відкрийте застосунок у Telegram
          </h1>
          <p className="mt-2.5 max-w-[19rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground">
            Це кабінет клієнта студії — увійти можна лише за посиланням на
            запис у Telegram-боті вашої студії.
          </p>
        </motion.div>
      </div>
    );
  }

  const screens: Record<string, React.ReactNode> = {
    home: <Home user={user} catalog={catalog} />,
    sched: <Shedule catalog={catalog} />,
    my: <MyLessons />,
    prof: <Profile catalog={catalog} />,
  };

  // 5️⃣ КОГДА ДАННЫЕ ПОЛУЧЕНЫ — ЗАПУСКАЕМ НАШЕ ПРИЛОЖЕНИЕ И ПЕРЕДАЕМ ЮЗЕРА В HOME
  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background">
      {/* mode="wait" держит порядок: старый экран уходит, только потом
          приходит новый. Одновременный кроссфейд на телефоне читается
          как подтормаживание, а не как переход. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.16 } }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
        >
          {/* Отступ под плавающую капсулу навигации — задан один раз здесь,
              иначе каждый экран обязан помнить про неё сам. */}
          <div className="pb-32">{screens[activeTab]}</div>
        </motion.div>
      </AnimatePresence>

      <BottomNav active={activeTab} onSelect={switchTab} />
    </div>
  );
}
