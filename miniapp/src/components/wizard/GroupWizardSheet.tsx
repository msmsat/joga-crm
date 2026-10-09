import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo, type Variants } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Studio, StudioCatalog } from '../../api/studio';
import type { GroupWizardFlow } from '../../hooks/useGroupWizard';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { bumpLessons } from '../../lib/revision';
import { formatDay, relativeDay } from '../../lib/slots';
import { hhmm, shownStep, type WizardStep } from '../../lib/wizard';
import { isGroupChosen, nextGroupStep } from '../../lib/groupWizard';
import { Sheet, SheetAction } from '../ui/Sheet';
import PhoneSheet from '../modals/PhoneSheet';
import SubscriptionSheet from '../modals/SubscriptionSheet';
import SuccessModal from '../modals/SuccessModal';
import CoffeeModal from '../modals/CoffeeModal';
import { LessonBookingActions } from '../booking/LessonBooking';
import WizardTabs from './WizardTabs';
import GroupTime from './GroupTime';
import { GroupServices, GroupTeachers } from './GroupChoices';
import GroupSummary from './GroupSummary';

type Props = {
  flow: GroupWizardFlow;
  catalog: StudioCatalog | null;
  onBuySubscription: () => void;
  /** Держать лист собранным заранее (`Sheet.keepMounted`): открытие — один выезд. */
  keepMounted?: boolean;
};

/** Без каталога — тот же пустой список, а не новый с каждой перерисовкой: «Время» сравнивает его по ссылке. */
const NO_BRANCHES: Studio[] = [];

/** Касания, которые не листают разделы: ряды, что сами едут вбок, и поля ввода. */
const NO_SWIPE = '[data-noswipe], input, textarea';

/** Смена раздела: направление листания и «мгновенно» — когда её сделал не тап. */
type Swap = { dir: number; instant: boolean; desktop: boolean };

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Раздел въезжает с той стороны, куда листнули. Варианты, а не объекты в
 * пропсах: уходящему разделу AnimatePresence передаёт `custom` СВЕЖИМ, и
 * «мгновенно» действует и на его уход, а не только на вход нового.
 */
const stepMotion: Variants = {
  enter: (c: Swap) => (c.instant ? { opacity: 1, x: 0, y: 0 } : c.desktop ? { opacity: 0, y: 10 } : { opacity: 0, x: c.dir * 28 }),
  center: { opacity: 1, x: 0, y: 0, transition: { duration: 0.22, ease } },
  exit: (c: Swap) => (c.instant
    ? { opacity: 0, transition: { duration: 0 } }
    : c.desktop ? { opacity: 0, y: -6, transition: { duration: 0.22, ease } } : { opacity: 0, x: c.dir * -28, transition: { duration: 0.22, ease } }),
};

/**
 * Запись на групповое занятие с главной — тот же лист, что у индивидуальной
 * записи (BookingWizardSheet): сверху разделы «Время · Услуга · Мастер ·
 * Итог», открываются в любом порядке, свайп листает их по очереди, выбор сам
 * ведёт дальше. На итоге — коврик и «Записаться».
 *
 * Во «Времени» — не кнопки часов, а карточки занятий дня: тап по карточке
 * выбирает занятие целиком и ведёт сразу на итог.
 *
 * Консоли с колонкой шагов на десктопе у него нет: выбор группы — это один
 * список занятий дня, а не сборка из трёх частей, и вкладок над ним хватает
 * на любой ширине.
 */
export default function GroupWizardSheet({ flow, catalog, onBuySubscription, keepMounted = false }: Props) {
  const { t, i18n } = useTranslation();
  const isDesktop = useIsDesktop();
  const { step, pick, lesson, booking } = flow;
  // Новый раздел открывается с начала, а не на высоте, где бросили прошлый.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 });
  }, [step]);

  const swipe = (event: PointerEvent, info: PanInfo) => {
    if ((event.target as HTMLElement | null)?.closest(NO_SWIPE)) return;
    if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y) * 1.4) return;
    const index = flow.steps.indexOf(step) + (info.offset.x < 0 ? 1 : -1);
    if (index >= 0 && index < flow.steps.length) flow.goTo(flow.steps[index]);
  };

  const relative = relativeDay(pick.day, flow.today);
  const day = relative ? t(`booking.${relative}`) : formatDay(pick.day, i18n.language, { day: 'numeric', month: 'short' });
  const serviceName = flow.service ? t(`lesson.name.${flow.service.name}`, { defaultValue: flow.service.name }) : null;
  const picked = [pick.time !== null ? `${day}, ${hhmm(pick.time)}` : null, serviceName].filter(Boolean).join(' · ');
  const done = (s: WizardStep) => isGroupChosen(pick, lesson, s);
  // Куда вести, когда занятие не сложилось. Скрытый раздел (тренер один) —
  // тоже «во Время»: уточнять тренером нечего.
  const next = shownStep(nextGroupStep(pick, lesson), flow.steps);
  const missing = next === 'summary' ? 'time' : next;

  const footer = step !== 'summary' ? undefined : lesson ? (
    <LessonBookingActions
      lesson={lesson}
      allowRepeat={flow.allowRepeat}
      selectedSpot={flow.selectedSpot}
      isProcessing={booking.isProcessing}
      onPay={flow.book}
      onCancel={flow.cancel}
      onClose={flow.close}
    />
  ) : (
    // Занятие не сложилось — кнопка не объясняет, чего не хватает, а ведёт
    // туда, где это выбирают: нет часа — во «Время», час есть, но занятий в
    // нём несколько — уточнять направление или тренера.
    <SheetAction onClick={() => flow.goTo(missing)}>
      {missing === 'time' ? t('wizard.go.time') : t(`groupWizard.go.${missing === 'service' ? 'service' : 'master'}`)}
    </SheetAction>
  );

  const swap: Swap = { dir: flow.dir, instant: flow.instantStep, desktop: isDesktop };

  // Листы на случай (телефон, абонемент, успех, кофе) собираются, когда
  // понадобились впервые, и дальше живут — ради анимации ухода. Закрытыми с
  // самого начала они перерисовывались бы с каждым выбором в мастере, в том
  // числе в кадре его открытия.
  const wanted = {
    phone: booking.needsPhone,
    subscription: booking.needsSubscription !== null,
    success: booking.isSuccessOpen,
    coffee: booking.isCoffeeOpen,
  };
  const [used, setUsed] = useState(wanted);
  if ((Object.keys(wanted) as (keyof typeof wanted)[]).some((key) => wanted[key] && !used[key])) {
    setUsed({
      phone: used.phone || wanted.phone,
      subscription: used.subscription || wanted.subscription,
      success: used.success || wanted.success,
      coffee: used.coffee || wanted.coffee,
    });
  }

  const title = step === 'service' || step === 'master'
    ? t(`groupWizard.titles.${step}`)
    : t(`wizard.titles.${step}`);

  return (
    <>
      <Sheet
        isOpen={flow.isOpen}
        onClose={flow.close}
        tall
        layer={2}
        kicker={catalog?.studio.name ?? t('wizard.title')}
        title={title}
        subtitle={picked || t('groupWizard.hint')}
        onBack={step !== 'summary' && lesson ? () => flow.goTo('summary') : undefined}
        backLabel={t('resource.back')}
        footer={footer}
        toolbar={<WizardTabs current={step} steps={flow.steps} done={done} onPick={flow.goTo} disabled={booking.isProcessing} />}
        keepMounted={keepMounted}
      >
        <motion.div
          ref={body}
          onPanEnd={isDesktop ? undefined : swipe}
          style={isDesktop ? undefined : { touchAction: 'pan-y' }}
          // @container — ширина колонки листа, а не окна: по ней варианты
          // решают, сколько их встаёт в ряд.
          className="@container min-h-[50%]"
        >
          <AnimatePresence mode="wait" initial={false} custom={swap}>
            <motion.div
              key={step}
              custom={swap}
              variants={stepMotion}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {step === 'time' && <GroupTime flow={flow} branches={catalog?.branches ?? NO_BRANCHES} catalog={catalog} />}
              {step === 'service' && <GroupServices flow={flow} />}
              {step === 'master' && <GroupTeachers flow={flow} />}
              {step === 'summary' && <GroupSummary flow={flow} catalog={catalog} />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </Sheet>

      {used.phone && (
        <PhoneSheet isOpen={booking.needsPhone} onClose={booking.closePhone} onSaved={booking.retryAfterPhone} layer={4} />
      )}
      {used.subscription && (
        <SubscriptionSheet
          isOpen={booking.needsSubscription !== null}
          onClose={booking.closeSubscription}
          message={booking.needsSubscription}
          onBuy={() => { booking.closeSubscription(); flow.close(); onBuySubscription(); }}
          layer={4}
        />
      )}
      {used.success && (
        <SuccessModal
          isOpen={booking.isSuccessOpen}
          onClose={booking.closeSuccess}
          lesson={booking.activeLesson}
          awaitingConfirmation={Boolean(catalog?.rules.confirmation_required)}
          layer={3}
        />
      )}
      {used.coffee && (
        <CoffeeModal
          isOpen={booking.isCoffeeOpen}
          onClose={booking.closeCoffee}
          lessonId={booking.activeLesson?.id ?? null}
          coffee={booking.coffee}
          onJoined={bumpLessons}
          layer={3}
        />
      )}
    </>
  );
}
