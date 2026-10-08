import { useEffect, useImperativeHandle, useState, type ComponentProps, type Ref } from 'react';
import { whenIdle } from '../../lib/idle';
import BuyModal from './BuyModal';

export type BuyModalHandle = { open: () => void };

/**
 * Витрина абонементов на главной — со своим состоянием «открыта».
 *
 * Тот же приём, что у мастеров записи (WizardHosts): живи флаг в самой главной,
 * открытие перерисовывало бы её целиком вместе с собранными листами мастеров,
 * и всё это — в кадре, где витрина только начинает выезжать. Главная знает о
 * витрине одно — как её открыть.
 */
export function BuyModalHost({ ref, prebuild = false, ...props }: Omit<ComponentProps<typeof BuyModal>, 'isOpen' | 'onClose' | 'keepMounted'> & {
  ref?: Ref<BuyModalHandle>;
  /** На главной есть билет абонемента — витрину стоит собрать заранее. */
  prebuild?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setIsOpen(true) }));

  // Лист собирается заранее — невидимым, когда главная уже показана и
  // приложению нечем заняться, как у мастеров записи. Тогда тап по билету —
  // только выезд готового листа: сборка шести карт в момент тапа стоила
  // ~550 мс при CPU ×4. Переключается только закрытый лист.
  const [warm, setWarm] = useState(false);
  useEffect(() => (prebuild ? whenIdle(() => setWarm(true), PREBUILD_DELAY_MS) : undefined), [prebuild]);
  const [keep, setKeep] = useState(false);
  if (warm && !keep && !isOpen) setKeep(true);

  return <BuyModal {...props} keepMounted={keep} isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}

/** Позже сборки мастера записи (1.8 с): два листа не собираются в одном простое. */
const PREBUILD_DELAY_MS = 2600;
