import { startTransition, useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { StudioCatalog } from '../../api/studio';
import { useBookingWizard } from '../../hooks/useBookingWizard';
import { useGroupWizard } from '../../hooks/useGroupWizard';
import type { GroupFocus, ResourceFocus } from '../../lib/entry';
import { whenIdle } from '../../lib/idle';
import { useBranchLater, type BranchStore } from '../home/branchStore';
import type { WizardStep } from '../../lib/wizard';
import BookingWizardSheet from './BookingWizardSheet';
import GroupWizardSheet from './GroupWizardSheet';

/**
 * Мастера записи — каждый в своём компоненте, а главная держит только пульт.
 *
 * Раньше их состояние жило в самой главной, и любое его изменение — открытие
 * листа, пришедший день, выбранный час — перерисовывало главную целиком:
 * название студии, кольца, карточки входа, капсулу филиала. На открытии это
 * давало сотни миллисекунд работы в том же кадре, где лист начинает выезжать
 * (замерено около 270 мс при CPU ×4 на повторном открытии и больше 600 — на
 * первом). Теперь перерисовывается только лист, а главная узнаёт о мастере
 * ровно одно — как его открыть.
 */

export type BookingWizardHandle = {
  open: (first: WizardStep, branch?: number | null, preset?: ResourceFocus) => void;
};

export type GroupWizardHandle = {
  open: (first: WizardStep, branch?: number | null, preset?: GroupFocus) => void;
};

type Common = {
  catalog: StudioCatalog | null;
  onNeedAuth: (retry: () => void) => void;
  onBuySubscription: () => void;
};

export function BookingWizardHost({ ref, catalog, onNeedAuth, onBuySubscription, onMyLessons }: Common & {
  ref?: Ref<BookingWizardHandle>;
  onMyLessons: () => void;
}) {
  const flow = useBookingWizard({ catalog, onNeedAuth });
  useImperativeHandle(ref, () => ({ open: flow.open }));
  return <BookingWizardSheet flow={flow} catalog={catalog} onBuySubscription={onBuySubscription} onMyLessons={onMyLessons} />;
}

export function GroupWizardHost({ ref, catalog, onNeedAuth, onBuySubscription, enabled, branches }: Common & {
  ref?: Ref<GroupWizardHandle>;
  /** У студии есть группы — сводку дней и первый день мастер берёт заранее. */
  enabled: boolean;
  /** Филиал, выбранный на главной сейчас (branchStore.ts). */
  branches: BranchStore;
}) {
  // Дни под новый адрес — переходом: собранный лист перерисовывается не в
  // кадре касания капсулы, а следом, уступая кадры её анимации.
  const branch = useBranchLater(branches, catalog?.branches);
  const flow = useGroupWizard({ catalog, onNeedAuth, enabled, branch });
  useImperativeHandle(ref, () => ({ open: flow.open }));

  // Лист собирается заранее — невидимым, когда главная уже показана и
  // приложению нечем заняться. Тогда тап по «Времени» — только выезд готового
  // листа: замерено, что сборка содержимого в момент тапа давала первый кадр
  // в 600+ мс при CPU ×4 (первая компиляция кода листа, первая укладка строк).
  // Переключается только закрытый лист: открытый так и доживёт до закрытия.
  // Переходом (`startTransition`): сборка листа — сотни миллисекунд рендера при
  // CPU ×4, и обычным обновлением это была одна длинная задача — тап по
  // главной, пришедшийся на неё, ждал её конца. Переход React режет на куски
  // и уступает касанию.
  const [warm, setWarm] = useState(false);
  useEffect(() => (enabled ? whenIdle(() => startTransition(() => setWarm(true)), PREBUILD_DELAY_MS) : undefined), [enabled]);
  const [keep, setKeep] = useState(false);
  if (warm && !keep && !flow.isOpen) setKeep(true);

  return <GroupWizardSheet flow={flow} catalog={catalog} onBuySubscription={onBuySubscription} keepMounted={keep} />;
}

/** Без requestIdleCallback — после анимаций входа главной (~1.1 с). */
const PREBUILD_DELAY_MS = 1800;
