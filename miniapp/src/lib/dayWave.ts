/**
 * Сигнал «лист записи открылся — пусть точки ритма загорятся волной».
 *
 * Сигнал, а не проп: лента дней живёт внутри вкладки «Время», которая
 * перерисовывается только при смене дня, выбора или данных (`memo`). Номер
 * открытия пропом ломал бы это ровно в кадре открытия — самом дорогом.
 */
const listeners = new Set<() => void>();

export function onDayWave(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function playDayWave(): void {
  listeners.forEach((listener) => listener());
}
