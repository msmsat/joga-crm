// «Время студии» в журнале: какое окно открыто и что уходит на сервер.
// Блок — занятость мастеров (back/services/time_blocks.py), поэтому после
// принятого изменения перечитываются те же кэши, что после правки графика
// сотрудника (syncStaffSchedule): сетка журнала, редактор графика, соседние
// вкладки. Отказ сервера оставляет черновик в окне и говорит тостом почему —
// и у кого: при блоке на всю команду иначе не понять, чьё занятие мешает.
//
// Нажатие на блок в сетке открывает карточку «что сделать» (view) — всем
// ролям; владелец переходит из неё к правке. Новый блок из окна создания
// открывается сразу формой (edit) и помнит дорогу назад (`back`).
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleApi, type StaffScheduleBlock, type StudioTimePayload } from '../../../../api/schedule';
import { syncStaffSchedule } from '../../../../api/staffScheduleCache';
import { ApiError } from '../../../../api/client';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import { clampDuration, defaultStart, draftFromBlock, type StudioTimeDraft } from '../studioTimeModel';

export type StudioTimeMode = 'view' | 'edit';

export function useStudioTime({ onShowDate, staffName }: {
  onShowDate: (date: string) => void;
  /** Имя сотрудника для сообщений: «Оля: в это время у сотрудника занятие». */
  staffName: (id: number) => string | undefined;
}) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const [open, setOpen] = useState<{ draft: StudioTimeDraft; mode: StudioTimeMode; back?: () => void } | null>(null);

  // Новый блок там, куда нажали: мастер, день и (если есть) время клетки.
  const openAt = useCallback((at: { staffId: number; date: string; start?: string; duration?: number }, back?: () => void) => {
    setOpen({
      draft: {
        staffIds: [at.staffId], date: at.date, start: at.start || defaultStart(at.date),
        duration: clampDuration(at.duration ?? 60), label: '', notes: '', photos: [],
      },
      mode: 'edit',
      back,
    });
  }, []);
  // Блок сетки → карточка. Стабильная ссылка: её получает каждая клетка.
  const openBlock = useCallback((block: StaffScheduleBlock) => {
    if (block.id != null) setOpen({ draft: draftFromBlock(block), mode: 'view' });
  }, []);
  const close = useCallback(() => setOpen(null), []);

  const fail = (error: unknown) => {
    const who = error instanceof ApiError && typeof error.detail?.staff_id === 'number'
      ? staffName(error.detail.staff_id) : undefined;
    const text = errorMessage(error, t);
    toast.error(who ? `${who}: ${text}` : text);
  };

  const submit = async (next: StudioTimeDraft, payload: Partial<StudioTimePayload>) => {
    try {
      const saved = next.id == null
        ? await syncStaffSchedule(scheduleApi.createStudioTime(payload as StudioTimePayload))
        : await syncStaffSchedule(scheduleApi.updateStudioTime(next.id, payload));
      const outside = (saved?.outside_hours ?? []).map(item => staffName(item.staff_id)).filter(Boolean);
      const done = t(next.id == null ? 'journal:studioTime.toasts.created' : 'journal:studioTime.toasts.updated');
      toast.success(outside.length ? `${done}. ${t('journal:studioTime.offHours.title')}: ${outside.join(', ')}` : done);
      onShowDate(next.date);
      return true;
    } catch (error) {
      fail(error);
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
      fail(error);
      return false;
    }
  };

  return {
    draft: open?.draft ?? null, mode: open?.mode ?? 'edit', back: open?.back,
    openAt, openBlock, close, submit, remove,
  };
}
