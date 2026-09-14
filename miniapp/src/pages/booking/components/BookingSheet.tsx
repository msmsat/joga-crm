import { useTranslation } from 'react-i18next';
import { Sheet } from '../../../components/ui/Sheet';
import { useResourceSheet } from '../../../components/booking/useResourceSheet';
import { useBusinessTerms } from '../../../hooks/useBusinessTerms';
import ServiceStep from './ServiceStep';
import BranchStep from './BranchStep';
import { ANY, branchOptions, choiceServices, fullName, sheetStep, type BookingPageState } from '../../../lib/bookingPage';
import type { ResourceStaffMember } from '../../../api/hybrid.types';
import type { Studio, StudioService } from '../../../api/studio';
import type { useResourceBooking } from '../../../hooks/useResourceBooking';

type Props = {
  state: BookingPageState;
  staff: ResourceStaffMember[];
  services: StudioService[];
  branches: Studio[];
  flow: ReturnType<typeof useResourceBooking>;
  onPickService: (service: StudioService) => void;
  onPickBranch: (branchId: number) => void;
  onBack: () => void;
  onClose: () => void;
  onBooked: () => void;
};

/**
 * Лист экрана «Записатись»: услуга мастера (если её ещё нет) → адрес (если
 * мастер принимает в нескольких выбранных филиалах) → день и время → условия →
 * итог.
 *
 * ПОЛНОЭКРАННЫЙ ЛИСТ СНИЗУ, А НЕ ОТДЕЛЬНАЯ СТРАНИЦА И НЕ ДИАЛОГ. Сравнивались
 * три варианта. Страница — лишний переход и потеря списка под пальцем: чтобы
 * сравнить второго мастера, человек возвращался бы назад по истории. Диалог по
 * центру — на 320px в нём не помещается лента дней и четыре колонки времени, а
 * длинный список часов прокручивался бы в окне внутри окна. Лист на 92% рамы
 * даёт весь экран под время, закрывается смахиванием или крестиком, и под ним
 * остаётся тот же список с тем же выбором. Каркас — общий `Sheet`: его высота
 * берётся от замороженной рамы (`--app-h`), а не от окна, и он не ездит за
 * панелью Safari и Instagram.
 *
 * ОДИН ЛИСТ НА ВСЕ ШАГИ. Смена шага меняет шапку и содержимое, но не сам лист:
 * два разных листа на «услугу» и «время» превращали выбор услуги в закрытие и
 * новый выезд снизу — шаг читался как «что-то сломалось и открылось заново».
 *
 * Состояние листа — у страницы (`lib/bookingPage.ts`), день/слот/quote — у
 * домена записи (`useResourceBooking`). Этот компонент только соединяет их.
 */
export default function BookingSheet({
  state, staff, services, branches, flow, onPickService, onPickBranch, onBack, onClose, onBooked,
}: Props) {
  const { t } = useTranslation();
  const terms = useBusinessTerms('resource');
  const step = sheetStep(state);
  const sheet = state.sheet;
  const member = sheet && sheet.master !== ANY ? staff.find((row) => row.teacher_id === sheet.master) ?? null : null;
  const parts = useResourceSheet(flow, { onOtherMaster: onClose, onDone: onBooked });
  // Шаги до времени — свои (услуга, адрес); время и дальше — общие части листа.
  const choosing = (step === 'service' || step === 'branch') && sheet !== null;
  const serviceId = sheet?.serviceId ?? null;
  const service = serviceId !== null ? services.find((row) => row.id === serviceId) ?? null : null;
  const places = step === 'branch' && sheet && serviceId !== null
    ? branches.filter((branch) => branchOptions(sheet.master, serviceId, staff).includes(branch.id))
    : [];
  const canBack = sheet !== null && (step === 'branch'
    ? sheet.canPickService
    : step === 'time' && flow.step === 'select_time' && (sheet.canPickBranch || sheet.canPickService));

  // Смахнули лист после записи — это тоже «готово», а не «передумал».
  const close = flow.step === 'done' ? onBooked : onClose;

  const subtitle = step === 'branch' && service
    ? t(`lesson.name.${service.name}`, { defaultValue: service.name })
    : choosing
      ? member?.department ?? (member ? undefined : t('booking.anyMasterHint'))
      : parts.subtitle;

  return (
    <Sheet
      isOpen={step !== null}
      onClose={close}
      layer={2}
      tall
      kicker={choosing ? terms.staff?.singular ?? t('booking.stepMaster') : parts.kicker}
      title={choosing ? (member ? fullName(member) : t('booking.anyMaster')) : parts.title}
      subtitle={subtitle}
      footer={choosing ? undefined : parts.footer}
      onBack={canBack ? onBack : undefined}
      backLabel={t('resource.back')}
    >
      {step === 'branch' ? (
        <>
          <p className="pb-4 text-[13px] font-semibold text-muted-foreground">{t('booking.pickBranch')}</p>
          <BranchStep options={places} onPick={onPickBranch} />
        </>
      ) : step === 'service' && sheet ? (
        <>
          <p className="pb-4 text-[13px] font-semibold text-muted-foreground">
            {terms.ready ? terms.message('choose_offering') : t('booking.pickService')}
          </p>
          <ServiceStep options={choiceServices(sheet.master, staff, services)} onPick={onPickService} />
        </>
      ) : (
        parts.body
      )}
    </Sheet>
  );
}
