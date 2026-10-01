import type { ReactNode } from 'react';
import { Sheet } from '../ui/Sheet';
import WizardRow, { WizardEmpty } from '../wizard/WizardRow';

export type PickItem = { id: number | string; title: string; hint?: string; lead: ReactNode };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  kicker?: string;
  title: string;
  subtitle?: string;
  items: PickItem[];
  empty: string;
  onPick: (id: PickItem['id']) => void;
};

/**
 * Короткий выбор из списка — мастер или услуга групповых занятий, либо
 * «индивидуально / в группе» у гибридной студии. Те же строки, что в мастере
 * записи: один предмет в двух местах выглядит одинаково.
 */
export default function PickSheet({ isOpen, onClose, kicker, title, subtitle, items, empty, onPick }: Props) {
  return (
    <Sheet isOpen={isOpen} onClose={onClose} kicker={kicker} title={title} subtitle={subtitle} layer={1}>
      {items.length === 0 ? (
        <WizardEmpty title={empty} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <WizardRow key={item.id} index={index} lead={item.lead} title={item.title} hint={item.hint} onClick={() => onPick(item.id)} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Круг с инициалами — для мастеров без фото и услуг. */
export function Initials({ text }: { text: string }) {
  const letters = text.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/12 text-[15px] font-extrabold text-brand">
      {letters || '•'}
    </span>
  );
}
