import { BundleSummary } from '../../../components/booking/BundleSummary';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../../hooks/useTelegram';
import { useServicePrice } from '../../../hooks/useServicePrice';
import { useServiceDuration } from '../../../hooks/useServiceDuration';
import type { StudioService } from '../../../api/studio';

type Props = {
  services: StudioService[];
  selected: number | null;
  onSelect: (serviceId: number | null) => void;
  loading: boolean;
};

const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0">
    <polyline points="5 12.5 10 17 19 7.5" />
  </svg>
);

/**
 * Услуги — фильтр над мастерами, одной строкой, которая листается вбок.
 *
 * Ростом в один чип, а не в сетку карточек: экран отвечает на «к кому я иду»,
 * и мастера обязаны быть видны сразу под этой строкой. Длительность и цена
 * стоят в чипе второй строкой — сравнить услуги можно, не открывая ни одну.
 *
 * Выбранное видно не только цветом: у активного чипа галочка, у кнопки —
 * `aria-pressed`. «Усі послуги» — первое и явное состояние без фильтра.
 */
export default function ServiceFilter({ services, selected, onSelect, loading }: Props) {
  const { t } = useTranslation();
  const { vibrateLight } = useTelegram();
  // Мастер здесь ещё не выбран — фильтр стоит НАД ним: цена «от–до».
  const priceOf = useServicePrice();
  const durationOf = useServiceDuration();

  if (loading) {
    return (
      <div aria-hidden="true" className="flex gap-2 overflow-hidden px-5 pb-1 pt-6">
        {[88, 132, 116].map((width, i) => (
          <div key={i} className="h-[54px] shrink-0 animate-pulse rounded-[18px] bg-card shadow-soft" style={{ width }} />
        ))}
      </div>
    );
  }
  if (services.length === 0) return null;

  const choose = (serviceId: number | null) => {
    vibrateLight();
    onSelect(serviceId);
  };

  return (
    /* `pb-4 -mb-3`: горизонтальная прокрутка обрезает всё, что выходит за
       ленту по вертикали, — и мягкие тени чипов обрывались ровной линией.
       Запас под тень внутри, компенсация снаружи — высота строки прежняя. */
    <div className="-mb-3 flex gap-2 overflow-x-auto px-5 pb-4 pt-6 dt:mb-0 dt:flex-wrap dt:gap-2.5 dt:overflow-visible dt:pb-1 dt:pt-8">
      <Chip active={selected === null} onClick={() => choose(null)}>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-extrabold tracking-[-0.015em]">
          {selected === null && check}
          {t('booking.allServices')}
        </span>
      </Chip>

      {services.map((service) => {
        const active = service.id === selected;
        return (
          <Chip key={service.id} active={active} onClick={() => choose(service.id)}>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-extrabold tracking-[-0.015em]">
              {active && check}
              {t(`lesson.name.${service.name}`, { defaultValue: service.name })}
            </span>
            <span
              className={`whitespace-nowrap text-[11.5px] font-semibold tabular-nums ${
                active ? 'text-brand-foreground/75' : 'text-muted-foreground'
              }`}
            >
              {durationOf(service, null)} · {priceOf(service, null)}
            </span>
            {active && <BundleSummary service={service} />}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`flex min-h-[54px] max-w-[300px] shrink-0 py-3 flex-col items-start justify-center gap-0.5 rounded-[18px] px-4 text-left transition-[background-color,box-shadow] duration-200 ${
        active ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-card text-card-foreground shadow-soft'
      }`}
    >
      {children}
    </motion.button>
  );
}
