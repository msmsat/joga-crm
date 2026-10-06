import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { StudioCatalog } from '../../api/studio';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { formatDay, relativeDay } from '../../lib/slots';
import { hhmm, isChosen, type WizardPick, type WizardStep } from '../../lib/wizard';
import { Sheet, SheetAction } from '../ui/Sheet';
import PhoneSheet from '../modals/PhoneSheet';
import SubscriptionSheet from '../modals/SubscriptionSheet';
import WizardTabs from './WizardTabs';
import WizardTime from './WizardTime';
import { WizardMasters, WizardServices, type Preview } from './WizardChoices';
import WizardSummary from './WizardSummary';
import WizardTicket from './WizardTicket';
import WizardRail from './WizardRail';
import WizardPaySheet from './WizardPaySheet';
import WizardDone from './WizardDone';

type Props = {
  flow: BookingWizardFlow;
  catalog: StudioCatalog | null;
  onBuySubscription: () => void;
  onMyLessons: () => void;
};

/** Касания, которые не листают разделы: ряды, что сами едут вбок, и поля ввода. */
const NO_SWIPE = '[data-noswipe], input, textarea';

/**
 * Запись с главной.
 *
 * Телефон — лист почти во весь экран, по образцу мастера записи журнала:
 * сверху разделы «Время · Услуга · Мастер · Итог», открываются в любом
 * порядке, свайп по листу листает их по очереди, выбор строки сам ведёт в
 * следующий невыбранный раздел. На итоге — «Оплатить» (лист способа оплаты и
 * кодов) или «Записаться», если платить нечего.
 *
 * Десктоп — консоль во всю высоту окна: слева колонка шагов с тем, что уже
 * выбрано (`WizardRail`), справа варианты, разложенные по ширине, итог —
 * билетом (`WizardTicket`). Наведение на вариант примеряет его в колонке.
 */
export default function BookingWizardSheet({ flow, catalog, onBuySubscription, onMyLessons }: Props) {
  const { t, i18n } = useTranslation();
  const isDesktop = useIsDesktop();
  const [paying, setPaying] = useState(false);
  // Примерка под мышью. Помнит раздел и выбор, от которых сделана: стоит
  // кликнуть или уйти в другой раздел — она устаревает сама, без эффекта.
  const [hover, setHover] = useState<{ step: WizardStep; base: WizardPick; pick: WizardPick } | null>(null);
  const { step, pick, quote, booking } = flow;
  // Новый раздел открывается с начала, а не на высоте, где бросили прошлый.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 });
  }, [step, booking]);

  const preview = hover && hover.step === step && hover.base === pick && !booking ? hover.pick : null;
  const onPreview: Preview | undefined = isDesktop
    ? (next) => setHover(next ? { step, base: pick, pick: next } : null)
    : undefined;

  const swipe = (event: PointerEvent, info: PanInfo) => {
    if ((event.target as HTMLElement | null)?.closest(NO_SWIPE)) return;
    if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y) * 1.4) return;
    const index = flow.steps.indexOf(step) + (info.offset.x < 0 ? 1 : -1);
    if (index >= 0 && index < flow.steps.length) flow.goTo(flow.steps[index]);
  };

  const relative = relativeDay(pick.day, flow.today);
  const day = relative ? t(`booking.${relative}`) : formatDay(pick.day, i18n.language, { day: 'numeric', month: 'short' });
  const serviceName = flow.service ? t(`lesson.name.${flow.service.name}`, { defaultValue: flow.service.name }) : null;
  const picked = [
    pick.time !== null ? `${day}, ${hhmm(pick.time)}` : null,
    serviceName,
  ].filter(Boolean).join(' · ');

  const funding = quote?.terms.domain.funding;
  const mustPay = funding?.kind === 'pay' && funding.price > 0;
  const close = () => {
    setPaying(false);
    setHover(null);
    flow.close();
  };

  // Не выбрано — кнопка ведёт в первый невыбранный раздел, а не перечисляет,
  // чего не хватает. Филиал — исключение: его чипы стоят тут же, на итоге.
  // Скрытый раздел (мастер один) сюда не попадает: его выбор подставлен сам.
  const missing = (['time', 'service', 'master'] as const).find((s) => flow.steps.includes(s) && !isChosen(pick, s));

  const footer = booking ? (
    <SheetAction onClick={() => { close(); onMyLessons(); }}>{t('wizard.toMyLessons')}</SheetAction>
  ) : step === 'summary' && missing ? (
    <SheetAction onClick={() => flow.goTo(missing)}>{t(`wizard.go.${missing}`)}</SheetAction>
  ) : step === 'summary' ? (
    <SheetAction
      disabled={!flow.complete || flow.quoting || flow.saving}
      onClick={() => {
        if (!quote) void flow.requestQuote();
        else if (mustPay) setPaying(true);
        else void flow.submit(flow.defaultMethod, null);
      }}
    >
      {flow.saving ? t('resource.confirming')
        : !flow.complete ? t('wizard.chooseBranch')
        : quote && mustPay ? t('pay.payAmount')
        : t('wizard.book')}
    </SheetAction>
  ) : undefined;

  return (
    <>
      <Sheet
        isOpen={flow.isOpen}
        onClose={close}
        tall
        layer={2}
        // Студия и выбранное на десктопе стоят в колонке слева — шапка справа
        // остаётся одним вопросом раздела.
        kicker={isDesktop ? undefined : catalog?.studio.name ?? t('wizard.title')}
        title={booking ? t('wizard.doneTitle') : t(`wizard.titles.${step}`)}
        subtitle={booking || isDesktop ? undefined : picked || t('wizard.hint')}
        onBack={!isDesktop && !booking && step !== 'summary' && isChosen(pick, 'time') && isChosen(pick, 'service') ? () => flow.goTo('summary') : undefined}
        backLabel={t('resource.back')}
        footer={footer}
        toolbar={!isDesktop && !booking ? (
          <WizardTabs current={step} steps={flow.steps} done={(s) => (s === 'summary' ? flow.complete : isChosen(pick, s))} onPick={flow.goTo} disabled={flow.saving} />
        ) : undefined}
        aside={<WizardRail flow={flow} catalog={catalog} preview={preview} />}
      >
        {booking ? (
          <WizardDone flow={flow} />
        ) : (
          <motion.div
            ref={body}
            onPanEnd={isDesktop ? undefined : swipe}
            style={isDesktop ? undefined : { touchAction: 'pan-y' }}
            // @container — ширина правой колонки, а не окна: по ней варианты
            // решают, сколько их встаёт в ряд.
            className="@container min-h-[50%]"
          >
            <AnimatePresence mode="wait" initial={false} custom={flow.dir}>
              <motion.div
                key={step}
                custom={flow.dir}
                initial={isDesktop ? { opacity: 0, y: 10 } : { opacity: 0, x: flow.dir * 28 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={isDesktop ? { opacity: 0, y: -6 } : { opacity: 0, x: flow.dir * -28 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {step === 'time' && <WizardTime flow={flow} onPreview={onPreview} />}
                {step === 'service' && <WizardServices flow={flow} onPreview={onPreview} />}
                {step === 'master' && <WizardMasters flow={flow} onPreview={onPreview} />}
                {step === 'summary' && (isDesktop ? <WizardTicket flow={flow} catalog={catalog} /> : <WizardSummary flow={flow} catalog={catalog} />)}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </Sheet>

      <WizardPaySheet
        isOpen={paying && !booking}
        onClose={() => setPaying(false)}
        quoteId={quote?.quote_id ?? null}
        subtitle={picked}
        canPayOnline={Boolean(catalog?.can_pay_online)}
        venueAllowed={flow.venueAllowed}
        saving={flow.saving}
        onPay={(method, payment) => void flow.submit(method, payment)}
      />

      <PhoneSheet isOpen={flow.needsPhone} onClose={flow.closePhone} onSaved={flow.retryAfterPhone} layer={4} />
      <SubscriptionSheet
        isOpen={flow.needsSubscription !== null}
        onClose={flow.closeSubscription}
        message={flow.needsSubscription}
        onBuy={() => { flow.closeSubscription(); close(); onBuySubscription(); }}
        layer={4}
      />
    </>
  );
}
