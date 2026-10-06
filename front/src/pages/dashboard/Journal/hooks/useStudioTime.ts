// «Время студии» в журнале: какое окно открыто и что уходит на сервер.
// Блок — занятость мастера (back/services/time_blocks.py), поэтому после
// принятого изменения перечитываются те же кэши, что после правки графика
// сотрудника (syncStaffSchedule): сетка журнала, редактор графика, соседние
// вкладки. Отказ сервера оставляет черновик в окне и говорит тостом почему.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleApi, type StaffScheduleBlock, type StudioTimePayload } from '../../../../api/schedule';
import { syncStaffSchedule } from '../../../../api/staffScheduleCache';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import { clampDuration, defaultStart, draftFromBlock, type StudioTimeDraft } from '../studioTimeModel';

export function useStudioTime({ onShowDate }: { onShowDate: (date: string) => void }) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const [draft, setDraft] = useState<StudioTimeDraft | null>(null);

  // Новый блок там, куда нажали: мастер, день и (если есть) время клетки.
  const openAt = useCallback((at: { staffId: number; date: string; start?: string; duration?: number }) => {
    setDraft({
      staffId: at.staffId, date: at.date, start: at.start || defaultStart(at.date),
      duration: clampDuration(at.duration ?? 60), label: '',
    });
  }, []);
  // Блок сетки → окно правки. Стабильная ссылка: её получает каждая клетка.
  const openBlock = useCallback((block: StaffScheduleBlock) => {
    if (block.id != null) setDraft(draftFromBlock(block));
  }, []);
  const close = useCallback(() => setDraft(null), []);

  const submit = async (next: StudioTimeDraft, payload: Partial<StudioTimePayload>) => {
    try {
      if (next.id == null) {
        await syncStaffSchedule(scheduleApi.createStudioTime(payload as StudioTimePayload));
        toast.success(t('journal:studioTime.toasts.created'));
      } else {
        await syncStaffSchedule(scheduleApi.updateStudioTime(next.id, payload));
        toast.success(t('journal:studioTime.toasts.updated'));
      }
      onShowDate(next.date);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t));
      return false;
    }
  };

  const remove = async (target: StudioTimeDraft) => {
    if (target.id == null) return false;
    try {
      await syncStaffSchedule(scheduleApi.deleteStudioTime(target.id));
      toast.success(t('journal:studioTime.toasts.deleted'));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t));
      return false;
    }
  };

  return { draft, openAt, openBlock, close, submit, remove };
}
