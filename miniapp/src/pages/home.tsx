import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HomeHero, { type BookingStart } from '../components/home/HomeHero';
import PickSheet, { type PickItem } from '../components/home/PickSheet';
import PassCard from '../components/home/PassCard';
import { BuyModalHost, type BuyModalHandle } from '../components/modals/BuyModalHost';
import {
  BookingWizardHost, GroupWizardHost, type BookingWizardHandle, type GroupWizardHandle,
} from '../components/wizard/WizardHosts';
import { STEP_ICONS } from '../components/wizard/stepIcons';
import { createBranchStore, knownBranch } from '../components/home/branchStore';
import { useMySubscription } from '../hooks/useMySubscription';
import { type UserResponse } from '../api/auth';
import type { StudioCatalog } from '../api/studio';
import type { WizardFocus } from '../lib/entry';

interface HomeProps {
  user: UserResponse | null;
  catalog: StudioCatalog | null;
  /** Переход в другой раздел кабинета. */
  onNavigate: (tab: string) => void;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Абонемент куплен — каталог перечитывается (цены и скидки у клиента свои). */
  onCatalogRefresh?: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** QR-код студии: открыть нужный мастер записи с тем, что в нём названо (`wizardFocusOf`). */
  focus: WizardFocus | null;
  onFocusUsed: () => void;
}

/**
 * Главная: название студии, карта абонемента и входы в запись — время, мастер
 * (когда их в студии несколько), услуга.
 *
 * Вход открывает мастер записи прямо здесь, листом поверх главной, — с
 * вкладками «Время · Услуга · Мастер · Итог» в любом порядке. Каким, решает
 * механика студии:
 *   resource — индивидуальный (окна мастеров, итог, оплата);
 *   event    — групповой (занятия дня, итог с ковриком);
 *   hybrid   — сначала вопрос «индивидуально или в группе», дальше — как выше.
 *
 * Сами мастера живут в своих компонентах (`WizardHosts`): главная держит
 * только пульт, и выбор внутри листа не перерисовывает её.
 */
export default function Home({ user, catalog, onNavigate, onBuySubscription, onCatalogRefresh, onNeedAuth, focus, onFocusUsed }: HomeProps) {
  const { t } = useTranslation();
  const mode = catalog?.booking_capabilities.booking_mode ?? 'event';
  // Филиал с главной — на весь сеанс, открывается на «Все». Живёт во внешнем
  // хранилище (branchStore.ts): выбор адреса не перерисовывает главную с её
  // собранными листами. Главная читает его в момент нажатия на вход.
  const [branches] = useState(createBranchStore);
  const branchNow = () => knownBranch(branches.get(), catalog?.branches);
  const wizard = useRef<BookingWizardHandle>(null);
  const groupWizard = useRef<GroupWizardHandle>(null);
  // Гибридная студия: вход выбран, ждём ответа «индивидуально или в группе».
  const [asking, setAsking] = useState<BookingStart | null>(null);
  // Витрина абонементов — листом поверх главной, а не переходом в профиль:
  // человек смотрит пакеты там же, где собирался записаться.
  const showcase = useRef<BuyModalHandle>(null);
  // Каталог перечитывается после покупки абонемента — и карта спрашивает заново.
  const subscription = useMySubscription(Boolean(user), catalog);
  // Карта — когда есть что на ней сказать: абонемент человека или пакеты
  // студии. Ответ об абонементе не пришёл с ошибкой — иначе «Купить» обещало
  // бы то, что у человека, возможно, уже есть.
  const showPass = Boolean(catalog) && !subscription.failed
    && (subscription.loading || subscription.active !== null || (catalog?.packages.length ?? 0) > 0 || catalog?.can_pay_online === false);

  // QR-код студии — запись с тем, что он назвал, со «Времени»: остальное код
  // назвал. Занятие групповой мастер сам уведёт на итог, когда придёт его день.
  // Один раз — дальше выбор человека.
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'resource') wizard.current?.open('time', null, focus);
    else groupWizard.current?.open('time', null, focus);
    onFocusUsed();
    // Ссылка разбирается один раз; `onFocusUsed` пересоздаётся каждым рендером App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const start = (choice: BookingStart) => {
    if (mode === 'resource') wizard.current?.open(choice, branchNow());
    else if (mode === 'event') groupWizard.current?.open(choice, branchNow());
    else setAsking(choice);
  };

  const modeItems: PickItem[] = [
    {
      id: 'resource', title: t('hero.mode.resource'), hint: t('hero.mode.resourceHint'),
      lead: <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand p-3 text-brand-foreground">{STEP_ICONS.master}</span>,
    },
    {
      id: 'event', title: t('hero.mode.event'), hint: t('hero.mode.eventHint'),
      lead: <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground p-3 text-background">{STEP_ICONS.time}</span>,
    },
  ];

  return (
    <div className="relative">
      <HomeHero
        catalog={catalog}
        name={user?.name ?? ''}
        branches={branches}
        onStart={start}
        pass={showPass ? (
          <PassCard
            active={subscription.active}
            loading={subscription.loading}
            packages={catalog?.packages ?? []}
            canPayOnline={catalog?.can_pay_online ?? false}
            onOpen={() => showcase.current?.open()}
            onBuy={() => showcase.current?.open()}
          />
        ) : null}
      />

      <PickSheet
        isOpen={asking !== null}
        onClose={() => setAsking(null)}
        kicker={catalog?.studio.name}
        title={t('hero.mode.title')}
        items={modeItems}
        empty=""
        onPick={(id) => {
          const choice = asking;
          setAsking(null);
          if (!choice) return;
          if (id === 'resource') wizard.current?.open(choice, branchNow());
          else groupWizard.current?.open(choice, branchNow());
        }}
      />

      <BuyModalHost
        ref={showcase}
        prebuild={showPass}
        onSuccess={onCatalogRefresh}
        packages={catalog?.packages ?? []}
        canPayOnline={catalog?.can_pay_online ?? false}
        active={subscription.active}
        studioName={catalog?.studio.name}
        currency={catalog?.studio.currency}
        signedIn={Boolean(user)}
        onNeedAuth={onNeedAuth}
      />

      <BookingWizardHost
        ref={wizard}
        catalog={catalog}
        onNeedAuth={onNeedAuth}
        onBuySubscription={onBuySubscription}
        onMyLessons={() => onNavigate('my')}
      />

      {/* Групповой мастер берёт сводку дней и первый день заранее — под филиал,
          выбранный здесь, — чтобы лист открывался сразу на нужном дне. */}
      <GroupWizardHost
        ref={groupWizard}
        catalog={catalog}
        onNeedAuth={onNeedAuth}
        onBuySubscription={onBuySubscription}
        enabled={mode !== 'resource'}
        branches={branches}
      />
    </div>
  );
}
