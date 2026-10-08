import type { Service } from '../../types';
import type { ServiceWeekSlot } from '../../../../../api/studio/services.api';
import { ServiceHero } from './ServiceHero';
import { ServiceBundle } from './ServiceBundle';
import { ServiceStats } from './ServiceStats';
import { ServiceWeek } from './ServiceWeek';
import { ServicePeople } from './ServicePeople';
import './ServiceCard.css';

interface Props {
  service: Service;
  categoryLabel: string;
  studioBookings30: number;
  hasMiniapp: boolean;
  canShareQr: boolean;
  weekSlots: ServiceWeekSlot[];
  weekLoading: boolean;
  onPick: (id: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onQr: () => void;
}

/**
 * Карточка услуги: шапка (что, почём, сколько времени забирает), затем
 * связи комплекса, записи и выручка, неделя и кто ведёт. Ключ по услуге —
 * смена услуги проигрывает вход заново и сбрасывает выбранный день недели.
 */
export function ServiceCard(props: Props) {
  const { service } = props;
  return (
    <div className="svc-scroll dock-scroll">
      <div className="svc-content cat-fade" key={service.id}>
        <ServiceHero
          service={service}
          categoryLabel={props.categoryLabel}
          hasMiniapp={props.hasMiniapp}
          canShareQr={props.canShareQr}
          onQr={props.onQr}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
        <ServiceBundle service={service} onPick={props.onPick} />
        <ServiceStats service={service} studioBookings30={props.studioBookings30} />
        <div className="svc-pair">
          <ServiceWeek slots={props.weekSlots} isLoading={props.weekLoading} />
          {service.masters.length > 0 && <ServicePeople service={service} />}
        </div>
      </div>
    </div>
  );
}
