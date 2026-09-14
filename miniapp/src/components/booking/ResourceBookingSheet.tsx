import { Sheet } from '../ui/Sheet';
import { useResourceSheet } from './useResourceSheet';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

/**
 * Лист индивидуальной записи для главной и «Моих записей» (перенос).
 *
 * Содержимое общее с экраном «Записатись» (`useResourceSheet`): день и время,
 * условия сервера, итог. Здесь лист открывается сразу на времени — услугу
 * человек уже нажал, мастер «любой».
 */
type Flow = ReturnType<typeof useResourceBooking>;

export default function ResourceBookingSheet({ flow, layer = 1 }: { flow: Flow; layer?: number }) {
  const parts = useResourceSheet(flow);

  return (
    <Sheet
      isOpen={flow.service !== null}
      onClose={flow.close}
      layer={layer}
      tall
      kicker={parts.kicker}
      title={parts.title}
      subtitle={parts.subtitle}
      footer={parts.footer}
    >
      {parts.body}
    </Sheet>
  );
}
