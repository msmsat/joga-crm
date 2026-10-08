import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import PaymentModal from './PaymentModal';
import PassCarousel from '../pass/PassCarousel';
import PassArt from '../pass/PassArt';
import PassDetails from '../pass/PassDetails';
import Ring from '../pass/Ring';
import { materialsOf } from '../pass/material';
import { createSelection, useSelection, type Selection } from '../pass/selection';
import { guilloche } from '../pass/guilloche';
import { whenIdle } from '../../lib/idle';
import { money } from '../../lib/money';
import { useTelegram } from '../../hooks/useTelegram';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useCheckoutCalc } from '../../hooks/useCheckoutCalc';
import { createCheckoutSession, type CheckoutOptions, type UserSubscription } from '../../api/user';
import { notify } from '../../lib/notify';
import type { SubscriptionPackageInfo } from '../../api/studio';

const NO_OPTIONS: CheckoutOptions = {
  promo_code: '',
  certificate_code: '',
  use_bonuses: false,
  use_deposit: false,
};

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  packages: SubscriptionPackageInfo[];
  /** Студия подключила приём онлайн-оплаты (Stripe Connect). */
  canPayOnline: boolean;
  /** Пришли из Клуба «использовать сертификат» — код уже подставлен в оплату.
   * Профиль пересоздаёт модалку по ключу, поэтому берётся начальным состоянием. */
  initialCertificate?: string | null;
  /** Пришли по QR абонемента — он и должен быть выбран. Тем же способом, что и
   *  сертификат: начальным состоянием, модалку пересоздаёт профиль по ключу. */
  initialPackageId?: number;
  /** Действующий абонемент — строкой над витриной: что уже есть, прежде чем выбирать новое. */
  active?: UserSubscription | null;
  /** Чья карта: название студии печатается на каждой. */
  studioName?: string;
  /** Валюта студии — для цены одного визита, которую сервер не присылает. */
  currency?: string;
  /** Витрину гость смотрит без входа; вход спрашивается у оплаты. */
  signedIn?: boolean;
  onNeedAuth?: (retry: () => void) => void;
  /** Держать лист собранным, пока закрыт (см. Sheet и BuyModalHost). */
  keepMounted?: boolean;
}

/**
 * Покупка абонемента: витрина карт → оплата.
 *
 * Открывается там, где о ней спросили, — на главной поверх записи, в профиле
 * поверх кабинета, — а не переводом в другой раздел. На телефоне это высокий
 * лист: карты, под ними — что выбрано, внизу — оплата. На десктопе — консоль:
 * подробности колонкой слева, сцена с картами справа.
 */
export default function BuyModal({
  isOpen,
  onClose,
  onSuccess,
  packages,
  canPayOnline,
  initialCertificate = null,
  initialPackageId,
  active = null,
  studioName = '',
  currency = 'EUR',
  signedIn = true,
  onNeedAuth,
  keepMounted = false,
}: BuyModalProps) {
  const { t, i18n } = useTranslation();
  const { tg } = useTelegram();
  const isDesktop = useIsDesktop();
  const reduce = Boolean(useReducedMotion());

  // Выбрана всегда карта у центра витрины. Открывается на пакете из QR, иначе
  // на первом; после закрытия витрина помнит, где её оставили. Выбор — во
  // внешнем хранилище (pass/selection.ts): лист от листания не перерисовывается.
  const [selection] = useState(() => createSelection(Math.max(0, packages.findIndex((plan) => plan.id === initialPackageId))));
  // Пакет, который платят: фиксируется в момент «Оплатить» и держит лист оплаты.
  const [paying, setPaying] = useState<SubscriptionPackageInfo | null>(null);
  const [options, setOptions] = useState<CheckoutOptions>(() => ({
    ...NO_OPTIONS,
    certificate_code: initialCertificate ?? '',
  }));

  // Гравировку карт считаем заранее, когда приложению нечем заняться: в кадре
  // открытия её расчёт стоил ~70 мс при CPU ×4. Дальше она в кэше.
  // Туда же — форматтер валюты: первое создание Intl.NumberFormat ~35 мс.
  useEffect(() => whenIdle(() => {
    packages.forEach((plan) => guilloche(plan.id));
    money(0, currency, i18n.language);
  }, 2500), [packages, currency, i18n.language]);

  const materials = useMemo(() => materialsOf(packages), [packages]);
  const nameOf = useCallback(
    (plan: SubscriptionPackageInfo) => t(`subscription.${plan.name}.name`, { defaultValue: plan.name }),
    [t],
  );
  // Карта рисуется по пакету и положению; ссылка стабильна, чтобы листание
  // перерисовывало только две карты, у которых сменился выбор.
  const renderCard = useCallback((plan: SubscriptionPackageInfo, offset: MotionValue<number>, opening: boolean, tick: number) => (
    <PassArt
      plan={plan}
      name={nameOf(plan)}
      material={materials.get(plan.id) ?? 'onyx'}
      studioName={studioName}
      offset={offset}
      countUp={opening}
      tick={tick}
      reduce={reduce}
    />
  ), [nameOf, materials, studioName, reduce]);

  // Расчёт запрашиваем только когда лист оплаты открыт: в витрине рычагов
  // ещё нет, и дёргать сервер на каждую пролистанную карту незачем.
  const { calc, isCalculating } = useCheckoutCalc(canPayOnline && paying ? paying.id : null, options);

  const handleClose = () => {
    setPaying(null);
    setOptions(NO_OPTIONS);
    onClose();
  };

  // Щелчок колеса выбора, а не удар: карта сменилась, ничего не нажато.
  const onPicked = useCallback(() => tg?.HapticFeedback?.selectionChanged(), [tg]);

  // Пришли из Клуба: сертификат уже в оплате, но пакет клиент ещё не выбрал.
  // Показываем это прямо в витрине — иначе код «пропадает» на один экран, и
  // непонятно, применится ли он вообще.
  const pendingCertificate = initialCertificate && options.certificate_code === initialCertificate
    ? initialCertificate
    : null;

  /**
   * Stripe открывается снаружи (`tg.openLink`, без Stripe.js на клиенте) —
   * подтверждение оплаты приходит бэку по вебхуку, а не нам напрямую. Здесь
   * нельзя честно сказать «оплата прошла»: мы просто не знаем, оплатил клиент
   * или закрыл вкладку. Единственный честный шаг — перечитать абонементы,
   * когда клиент вернулся в Telegram, и показать то, что реально в базе.
   */
  const waitForReturnAndRefresh = () => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      if (onSuccess) onSuccess();
      notify(t('buyModal.checking_payment'));
      handleClose();
    };
    document.addEventListener('visibilitychange', onVisible);
  };

  const startPayment = async () => {
    if (!paying || !canPayOnline) return;

    try {
      const { url, paid } = await createCheckoutSession(paying.id, options);

      // Сертификат/депозит/баллы покрыли всё — Stripe не нужен, абонемент уже
      // начислен на сервере. Здесь мы ЗНАЕМ, что оплата прошла, поэтому
      // говорим прямо, а не «проверяем оплату», как в случае с картой.
      if (paid || !url) {
        if (onSuccess) onSuccess();
        notify(t('buyModal.activated'));
        handleClose();
        return;
      }

      if (tg?.openLink) tg.openLink(url);
      else window.open(url, '_blank');
      setPaying(null);
      waitForReturnAndRefresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('buyModal.activate_error'));
    }
  };

  // Гость платит после входа: вход поднимается поверх витрины, и оплата
  // открывается сама, как только он закончится.
  const openPayment = () => {
    const plan = packages[selection.get().index] ?? null;
    if (!plan) return;
    if (!signedIn && onNeedAuth) onNeedAuth(() => setPaying(plan));
    else setPaying(plan);
  };

  const current = active && (
    <div className="flex items-center gap-3 rounded-[18px] bg-foreground py-2.5 pl-2.5 pr-4 text-background dark:bg-muted dark:text-foreground">
      <Ring
        left={Math.max(0, Math.min(active.classes_left, active.total_classes))}
        total={Math.max(0, active.total_classes)}
        reduce={reduce}
        className="h-11 w-11"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold opacity-60">{t('profile.current_sub')}</span>
        <span className="block truncate text-[14px] font-extrabold tracking-[-0.02em]">
          {t(`subscription.${active.type}.name`, { defaultValue: active.type })}
        </span>
      </span>
      <span className="shrink-0 text-right text-[11px] font-semibold opacity-60">
        {t(active.is_frozen ? 'profile.frozen' : 'profile.expires', {
          date: new Date(active.expires_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
        })}
      </span>
    </div>
  );

  const certificate = pendingCertificate && canPayOnline && (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-[16px] bg-brand/10 px-4 py-3 ring-1 ring-inset ring-brand/25"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-foreground">
        {t('buyModal.certificate_ready')}
        <span className="ml-1 font-mono text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground">
          {pendingCertificate}
        </span>
      </span>
    </motion.div>
  );

  const details = packages.length > 0 && (
    <>
      <SelectedDetails selection={selection} packages={packages} nameOf={nameOf} currency={currency} reduce={reduce} />
      {!canPayOnline && (
        <p className="mt-4 text-[12.5px] font-medium leading-relaxed text-muted-foreground">{t('buyModal.pay_in_studio')}</p>
      )}
    </>
  );

  const showcase = packages.length > 0 && (
    <PassCarousel
      packages={packages}
      selection={selection}
      onPicked={onPicked}
      open={isOpen}
      materials={materials}
      nameOf={nameOf}
      label={t('buyModal.title')}
      prevLabel={t('buyModal.prev')}
      nextLabel={t('buyModal.next')}
      reduce={reduce}
      renderCard={renderCard}
    />
  );

  const empty = packages.length === 0 && (
    <div className="rounded-[20px] bg-background p-5 text-[13px] font-medium leading-relaxed text-muted-foreground">
      {t(canPayOnline ? 'buyModal.no_plans' : 'buyModal.offline_help')}
    </div>
  );

  // Над витриной строка действующего абонемента забирает высоту — карты
  // уступают её, а не уводят цену и оплату за край листа.
  const stageStyle = { '--pass-card-shrink': active ? '56px' : '0px' } as CSSProperties;

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={handleClose}
        keepMounted={keepMounted}
        tall
        kicker={t('buyModal.tag')}
        title={t('buyModal.title')}
        aside={packages.length > 0 ? (
          <div className="flex h-full flex-col gap-6 p-8 pt-10">
            {current}
            <div className="my-auto">{details}</div>
          </div>
        ) : undefined}
        footer={
          canPayOnline && packages.length > 0 ? (
            <PayAction selection={selection} packages={packages} onPay={openPayment} />
          ) : (
            <SheetAction tone={packages.length > 0 ? 'ghost' : 'brand'} onClick={handleClose}>{t('buyModal.close')}</SheetAction>
          )
        }
      >
        <div style={stageStyle} className="flex min-h-[calc(100%-1rem)] flex-col gap-4">
          {certificate}
          {!isDesktop && current}
          {empty}
          {showcase && <div className="my-auto">{showcase}</div>}
          {!isDesktop && details && <div className="pt-1">{details}</div>}
        </div>
      </Sheet>

      <PaymentModal
        isOpen={canPayOnline && paying !== null}
        onClose={() => setPaying(null)}
        itemName={paying ? nameOf(paying) : ''}
        amountStr={paying ? paying.final_price_str : ''}
        calc={calc}
        isCalculating={isCalculating}
        options={options}
        onOptionsChange={(patch) => setOptions((prev) => ({ ...prev, ...patch }))}
        onPay={startPayment}
      />
    </>
  );
}

/** Что выбрано под картами — подписано на выбор, а не на состояние листа. */
function SelectedDetails({ selection, packages, nameOf, currency, reduce }: {
  selection: Selection;
  packages: SubscriptionPackageInfo[];
  nameOf: (plan: SubscriptionPackageInfo) => string;
  currency: string;
  reduce: boolean;
}) {
  const { index, dir } = useSelection(selection);
  const plan = packages[Math.min(index, packages.length - 1)];
  if (!plan) return null;
  return <PassDetails plan={plan} name={nameOf(plan)} dir={dir} currency={currency} reduce={reduce} />;
}

/** Оплата выбранного пакета — цена в кнопке следует за листанием. */
function PayAction({ selection, packages, onPay }: {
  selection: Selection;
  packages: SubscriptionPackageInfo[];
  onPay: () => void;
}) {
  const { t } = useTranslation();
  const { index } = useSelection(selection);
  const plan = packages[Math.min(index, packages.length - 1)];
  return <SheetAction onClick={onPay}>{t('buyModal.pay', { price: plan?.final_price_str ?? '' })}</SheetAction>;
}
