import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/home';
import Shedule from './pages/shedule';
import MyLessons from './pages/mylessons';
import Profile from './pages/profile';
import BottomNav from './components/BottomNav';
import Welcome from './components/Welcome';
import { checkUser, registerUser, type UserResponse } from './api/auth';
import { useTelegram } from './hooks/useTelegram';
import { getSession, saveSession, newDeviceId } from './lib/session';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { tg, user: tgUser } = useTelegram();

  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSignup, setNeedsSignup] = useState(false);

  // Ключ общий на все студии, поэтому знакомство спрашивается ровно один раз:
  // выбор другой студии на него не влияет, вход после него не нужен.
  const remember = (profile: UserResponse) => {
    saveSession({ tg_id: profile.tg_id, name: profile.name, phone: profile.phone });
    setUser(profile);
  };

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const authUser = async () => {
      const session = getSession();
      // Сохранённый ключ важнее Telegram: он переживает и смену студии, и заход
      // с сайта вместо бота.
      const id = session?.tg_id ?? tgUser?.id;

      // Ключа нет и Telegram не представил юзера — знакомимся.
      if (!id) {
        setNeedsSignup(true);
        setIsLoading(false);
        return;
      }

      try {
        const result = await checkUser(id);

        if (result.exists && result.user) {
          remember(result.user);
        } else if (tgUser) {
          // Внутри бота имя уже известно — форму показывать незачем.
          remember(await registerUser({ tg_id: id, name: tgUser.first_name }));
        } else {
          // Ключ есть, а профиля в базе нет (базу чистили) — знакомимся заново.
          setNeedsSignup(true);
        }
      } catch (error) {
        // Сервер не ответил — ключ остаётся валидным, регистрацию не переспрашиваем.
        console.error('Помилка при авторизації/реєстрації:', error);
        if (!session) setNeedsSignup(true);
      } finally {
        setIsLoading(false);
      }
    };

    authUser();
  }, []);

  // Ошибку намеренно не глушим: её показывает форма знакомства.
  const completeSignup = async (name: string, phone: string) => {
    const id = tgUser?.id ?? getSession()?.tg_id ?? newDeviceId();
    remember(await registerUser({ tg_id: id, name, phone }));
    setNeedsSignup(false);
  };

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

  if (needsSignup) {
    return <Welcome onSubmit={completeSignup} defaultName={tgUser?.first_name ?? ''} />;
  }

  const screens: Record<string, React.ReactNode> = {
    home: <Home user={user} />,
    sched: <Shedule />,
    my: <MyLessons />,
    prof: <Profile />,
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
