import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/home';
import Shedule from './pages/shedule';
import MyLessons from './pages/mylessons';
import Profile from './pages/profile';
import Club from './pages/club';
import BottomNav from './components/BottomNav';
import DesktopNav from './components/DesktopNav';
import AmbientBackdrop from './components/home/AmbientBackdrop';
import Auth from './pages/auth';
import { authTelegram, type UserResponse } from './api/auth';
import { getStudioCatalog, type StudioCatalog } from './api/studio';
import { getLoyalty, type LoyaltyOverview } from './api/loyalty';
import { useTelegram } from './hooks/useTelegram';
import { useIsDesktop } from './hooks/useIsDesktop';
import { visibleNavItems } from './components/navItems';
import { readEntry, readTab } from './lib/entry';
import { applyBranding, applyDefaultLanguage } from './lib/branding';
import { getSession, saveSession, clearSession } from './lib/session';
import './App.css';

export default function App() {
  // Ссылка из письма студии ведёт в конкретный раздел (`?tab=my`), а не «в
  // приложение вообще»: клиент открыл письмо про запись — он должен увидеть
  // запись. Читаем один раз при первом рендере: дальше вкладками управляет меню.
  const [activeTab, setActiveTab] = useState(() => readTab() ?? 'home');
  // Код сертификата, с которым пришли из Клуба. Профиль забирает его, открывает
  // покупку и сбрасывает — иначе тот же сертификат подставился бы и в следующий
  // раз, когда клиент просто зашёл купить абонемент.
  const [pendingCertificate, setPendingCertificate] = useState<string | null>(null);
  const { tg } = useTelegram();
  const isDesktop = useIsDesktop();

  const [user, setUser] = useState<UserResponse | null>(null);
  const [catalog, setCatalog] = useState<StudioCatalog | null>(null);
  // Лояльность грузится вместе с каталогом: от неё зависит не только сама
  // страница «Клуб», но и есть ли этот пункт в меню вообще.
  const [loyalty, setLoyalty] = useState<LoyaltyOverview | null>(null);
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
  // Вход ещё одним аккаунтом из меню (AccountMenu). Отдельное состояние, а не
  // `needsAuth`: текущая сессия жива и обязана вернуться на место, если человек
  // передумал на полпути.
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  /** Каталог грузится после входа — и перечитывается после покупки.
   *
   * Раньше это был снимок на весь сеанс, и для филиалов/услуг так и есть. Но
   * цены пакетов теперь считаются под конкретного клиента (скидка новичка по
   * реферальной ссылке, персональный оффер), а одноразовая скидка гаснет в
   * момент оплаты — устаревший снимок обещал бы её второй раз. */
  const loadCatalog = async () => {
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

    // Отдельным запросом и без await в общей цепочке: упавшая лояльность не
    // должна мешать войти в кабинет — раздел просто не появится в меню.
    try {
      setLoyalty(await getLoyalty());
    } catch (error) {
      console.error('Не вдалося завантажити програму лояльності:', error);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.disableVerticalSwipes?.();
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
    // Прокручивает страница целиком, а не своя область внутри окна, поэтому
    // новый раздел иначе открывался бы на той же высоте, где бросили прошлый.
    window.scrollTo({ top: 0 });
  };

  /**
   * «Использовать сертификат» из Клуба: переносит клиента в покупку абонемента
   * с уже подставленным кодом.
   *
   * Живёт в App, потому что Клуб и покупка — разные вкладки: переписывать код
   * из одного раздела в другой руками клиент не должен, а сама форма оплаты
   * принадлежит профилю (BuyModal), не Клубу.
   */
  const useCertificate = (code: string) => {
    setPendingCertificate(code);
    switchTab('prof');
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

  // Вход вторым аккаунтом. `anonymous` обязателен: под живой сессией бэкенд
  // вместо входа привязал бы введённую почту текущей карточке (см. api/auth.ts).
  // После входа — перезагрузка: весь кабинет (расписание, абонемент, лояльность)
  // загружен под прежний токен, и чинить это по кускам дороже, чем начать заново.
  if (isAddingAccount && entry.studioId) {
    return (
      <Auth
        studioId={entry.studioId}
        anonymous
        onCancel={() => setIsAddingAccount(false)}
        onDone={(authedUser, token) => {
          saveSession({ token, name: authedUser.name });
          window.location.reload();
        }}
      />
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
    prof: (
      <Profile
        catalog={catalog}
        onCatalogRefresh={loadCatalog}
        pendingCertificate={pendingCertificate}
        onPendingCertificateUsed={() => setPendingCertificate(null)}
      />
    ),
    club: <Club data={loyalty} onUseCertificate={useCertificate} />,
  };

  const navItems = visibleNavItems(Boolean(loyalty?.enabled));

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
  //
  // Прокрутка — обычная, документа: никаких `h-[100dvh] overflow-hidden` и
  // области со своей полосой внутри окна. Меню держится на месте через
  // sticky, а не потому, что контент прокручивается отдельно от него.
  return (
    <div className="relative">
      <AmbientBackdrop tint={catalog?.studio.accent_color ?? '#F9A08B'} />

      <div className="flex">
        {isDesktop && (
          <DesktopNav
            active={activeTab}
            onSelect={switchTab}
            items={navItems}
            studioName={catalog?.studio.name}
            logoUrl={catalog?.studio.logo_url}
            userName={user?.name}
            onAddAccount={() => setIsAddingAccount(true)}
          />
        )}

        <div className="min-w-0 flex-1">
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
            >
              {/* Одна колонка сверху вниз. На десктопе у неё есть потолок
                  ширины и она стоит по центру: карточка в 1600px — это строка
                  текста, прижатая к левому краю, с полем пустоты справа.
                  Нижний отступ на телефоне — под плавающую капсулу меню,
                  иначе про неё обязан помнить каждый экран. */}
              <div className="mx-auto w-full pb-32 dt:max-w-[980px] dt:px-8 dt:pb-20">
                {screens[activeTab]}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {!isDesktop && <BottomNav active={activeTab} onSelect={switchTab} items={navItems} />}
    </div>
  );
}
