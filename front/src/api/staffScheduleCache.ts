import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';

// Как и согласие на cookie, изменения передаются соседним вкладкам через
// storage. Здесь только сигнал: график и данные сотрудника остаются на сервере.
const STORAGE_KEY = 'velora:staff-schedule-changed';

function refreshSchedule() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffScheduleEditorAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.journalStaffBlocksAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staff });
}

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && event.newValue) refreshSchedule();
});

/** Уведомляем журнал только после принятого сервером изменения графика. */
export async function syncStaffSchedule<T>(request: Promise<T>): Promise<T> {
  const result = await request;
  refreshSchedule();
  try {
    localStorage.setItem(STORAGE_KEY, `${Date.now()}:${Math.random()}`);
  } catch {
    // Вкладка уже обновлена; при запрещённом хранилище остальные подтянутся
    // через обычное обновление журнала при фокусе / раз в минуту.
  }
  return result;
}
