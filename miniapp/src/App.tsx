import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/home';
import Shedule from './pages/shedule';
import MyLessons from './pages/mylessons';
import Profile from './pages/profile';
import BottomNav from './components/BottomNav';
import DesktopNav from './components/DesktopNav';
import AmbientBackdrop from './components/home/AmbientBackdrop';
import Auth from './pages/auth';
import { authTelegram, type UserResponse } from './api/auth';
import { getStudioCatalog, type StudioCatalog } from './api/studio';
import { useTelegram } from './hooks/useTelegram';
import { useIsDesktop } from './hooks/useIsDesktop';
import { readEntry } from './lib/entry';
import { applyBranding, applyDefaultLanguage } from './lib/branding';
import { getSession, saveSession, clearSession } from './lib/session';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { tg } = useTelegram();
  const isDesktop = useIsDesktop();

  const [user, setUser] = useState<UserResponse | null>(null);
  const [catalog, setCatalog] = useState<StudioCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Студия известна, сессии нет → показываем вход по почте. Студия неизвестна
  // (голый адрес без `/s/<id>` и без deep-link) → показать нечего: в какой
  // кабинет пускать, приложение не знает.
  // useMemo, а не голый вызов: ссылка на entry уходит в зависимости boot-эффекта,
  // и пересоздание объекта на каждый рендер гоняло бы авторизацию по кругу.
  const entry = useMemo(
    () => readEntry(tg?.initDataUnsafe?.start_param, Boolean(tg)),
    [tg],
  );
  const [needsAuth, setNeedsAuth] = useState(false);

  /** Каталог грузится один раз после входа — любым способом. */
  const loadCatalog = async () => {
    // Один снимок каталога студии на весь сеанс — филиалы/послуги/пакеты
    // не меняются настолько часто, чтобы держать их за TanStack Query
    // (эпик прямо отказывается от неё, см. "Явно НЕ делаем").
    try {
      const data = await getStudioCatalog();
      // Брендинг применяем здесь, а не в рендере: цвет и тема живут в токенах
      // на <html>, их видит и то, что рисуется вне React (оверлеи, фон body).
      applyBranding(data.studio.accent_color, data.studio.dark_mode);
      applyDefaultLanguage(data.studio.language);
      setCatalog(data);
    } catch (error) {
      console.error('Не вдалося завантажити дані студії:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const boot = async () => {
      // Токен уже сохранён — доверяем ему сразу, без похода на бэкенд:
      // эндпоинта на валидацию токена нет, а если он всё же протух, первый
      // же авторизованный запрос поймает 401 и client.ts сам сбросит сессию
      // (см. api/client.ts). Это же и есть «запомнить меня»: токен живёт
      // 30 дней и лежит в localStorage независимо от того, какой дверью вошли.
      const session = getSession();
      if (session?.token) {
        // Полного профиля тут ещё нет — из downstream-страниц используется
        // только .name (home.tsx), остальное подтянется из /global/me, когда
        // экраны его запросят (профиль уже это делает).
        setUser({ name: session.name } as UserResponse);
      } else {
        const initData: string | undefined = tg?.initData;

        // Telegram — молчаливый вход: подпись initData уже доказала личность,
        // спрашивать почту сверху было бы лишним экраном на ровном месте.
        if (initData && entry.studioId) {
          try {
            const { token, user: authedUser } = await authTelegram({
              init_data: initData,
              studio_id: entry.studioId,
              referral_code: entry.referralCode,
            });
            saveSession({ token, name: authedUser.name });
            setUser(authedUser);
          } catch (error) {
            console.error('Помилка авторизації через Telegram:', error);
            // На случай, если в сторадже лежал протухший токен.
            clearSession();
            setNeedsAuth(true);
            setIsLoading(false);
            return;
          }
        } else {
          setNeedsAuth(true);
          setIsLoading(false);
          return;
        }
      }

      await loadCatalog();
    };

    boot();
  }, [tg, entry]);

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

  // Студию знаем — значит вход возможен и вне Telegram: по коду на почту.
  if (needsAuth && entry.studioId) {
    return (
      <Auth
        studioId={entry.studioId}
        referralCode={entry.referralCode}
        onDone={(authedUser, token) => {
          saveSession({ token, name: authedUser.name });
          setUser(authedUser);
          setNeedsAuth(false);
          setIsLoading(true);
          loadCatalog();
        }}
      />
    );
  }

  // Студии нет вовсе: открыли голый адрес без `/s/<id>` и без deep-link.
  // Единственное, что можно честно сказать — нужна ссылка студии.
  if (needsAuth) {
    return (
      <div className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-8 text-center">
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
            Потрібне посилання студії
          </h1>
          <p className="mt-2.5 max-w-[19rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground">
            Це кабінет клієнта. Відкрийте його за посиланням вашої студії —
            з Telegram, Instagram або сайту.
          </p>
        </motion.div>
      </div>
    );
  }

  const screens: Record<string, React.ReactNode> = {
    home: <Home user={user} catalog={catalog} onNavigate={switchTab} />,
    sched: <Shedule catalog={catalog} />,
    my: <MyLessons />,
    prof: <Profile catalog={catalog} />,
  };

  // 5️⃣ КОГДА ДАННЫЕ ПОЛУЧЕНЫ — ЗАПУСКАЕМ НАШЕ ПРИЛОЖЕНИЕ И ПЕРЕДАЕМ ЮЗЕРА В HOME
  //
  // Каркас один, меню два. Держать в DOM оба и прятать лишнее медиазапросом
  // нельзя: у активного пункта в каждом свой layoutId, и framer связал бы
  // подсветку невидимого меню с видимым в один переезд через полэкрана.
  //
  // Свет студии живёт здесь, а не на страницах: внутри колонки контента он
  // обрезался её шириной и читался прямоугольником тона посреди белого поля.
  // На каркасе он заливает всё окно, включая меню, — это и есть освещение.
  // Фона на этом узле быть не должно: подложка стоит на -z-10, а собственный
  // фон родителя закрасил бы её (фон страницы приходит из body, index.css).
  return (
    <div className="relative h-[100dvh] overflow-hidden">
      <AmbientBackdrop tint={catalog?.studio.accent_color ?? '#F9A08B'} />

      {/* Рамка приложения. Без потолка ширины меню прилипало к левому краю
          монитора, а колонка контента вставала по центру остатка — между ними
          зияла полоса в треть экрана. Общий потолок и центрирование всей пары
          держат эту полосу постоянной на любой диагонали. */}
      <div className="mx-auto flex h-full w-full max-w-[1560px]">
        {isDesktop && (
          <DesktopNav
            active={activeTab}
            onSelect={switchTab}
            studioName={catalog?.studio.name}
            logoUrl={catalog?.studio.logo_url}
            userName={user?.name}
          />
        )}

        <div className="relative min-w-0 flex-1 overflow-hidden">
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
              className="scroll-main absolute inset-0 overflow-y-auto overflow-x-hidden"
            >
              {/* Колонка контента: на телефоне во всю ширину с отступом под
                  плавающую капсулу (иначе каждый экран обязан помнить про неё
                  сам), на десктопе — 1160px по центру. Шире строки текста
                  расползаются, и экран читается как растянутый телефон. */}
              <div className="mx-auto w-full pb-32 dt:max-w-[1160px] dt:px-10 dt:pb-24">
                {screens[activeTab]}
              </div>
            </motion.div>
          </AnimatePresence>

          {!isDesktop && <BottomNav active={activeTab} onSelect={switchTab} />}
        </div>
      </div>
    </div>
  );
}
