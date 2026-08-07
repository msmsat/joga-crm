import type { ChannelKey } from './types';
import type { ChannelStatus, MatrixRead, MatrixEventRow, WaTemplateSummary } from '../../../api/notifications/notifications.types';

// Подключить номер и начать платить — на стороне Meta разные шаги, поэтому у
// WhatsApp два рабочих состояния. Без карты канал живой, но доставляет только
// ответы авто-ответчика в 24-часовом окне; напоминания (платные шаблоны) Meta
// отклоняет. Три значения, а не два: null — ещё не проверяли или Meta не
// ответила, и пугать студию «оплаты нет» в этом случае нельзя.
export function waPaymentConnected(status?: ChannelStatus): boolean | null {
  const value = status?.details?.payment_connected;
  return typeof value === 'boolean' ? value : null;
}

// Второе условие запуска, независимое от карты: Business Portfolio студии должен
// пройти верификацию Meta (код 141010). Проходит его сама студия — её WABA
// подключён как CLIENT_OWNED, приложение Velora к её бизнесу отношения не имеет.
// Тоже три состояния: null — не проверяли или Meta не ответила.
export function waBusinessVerified(status?: ChannelStatus): boolean | null {
  const value = status?.details?.business_verified;
  return typeof value === 'boolean' ? value : null;
}

// Третье условие доставки, независимое от карты и верификации: без одобренного
// Meta шаблона уведомление не уйдёт вовсе. null — статусы ещё не читали (номер
// подключён до автосинхронизации либо Meta не ответила), и это НЕ «всё плохо».
export function waTemplates(status?: ChannelStatus): WaTemplateSummary | null {
  const value = status?.details?.templates;
  return value && typeof value === 'object' ? (value as WaTemplateSummary) : null;
}

// Что мешает ВКЛЮЧИТЬ WhatsApp тумблером, либо null — можно. Зеркало
// services/whatsapp.enable_blocker: тот же порядок барьеров (карта -> верификация
// -> шаблоны), потому что бэкенд всё равно ответит 409 с этим же кодом, и
// подсказка обязана совпадать с отказом. Здесь это нужно, чтобы тумблер был
// заблокирован ДО клика, а не ругался после.
//
// Канал не подключён (или статусы ещё грузятся) — не наш случай: там рисуется
// кнопка «Подключить», а запирать тумблер на время загрузки незачем.
export type WaBlocker = 'payment' | 'verification' | 'templates';

export function waEnableBlocker(status?: ChannelStatus): WaBlocker | null {
  if (!status?.connected) return null;
  if (waPaymentConnected(status) !== true) return 'payment';
  if (waBusinessVerified(status) !== true) return 'verification';
  // Ни одного одобренного шаблона — писать первым нечем, доставка ноль.
  // null (статусы ещё не читали) считаем блокирующим: «не знаем» ≠ «работает».
  if (!waTemplates(status)?.approved) return 'templates';
  return null;
}

// Оптимистичная правка одной ячейки — до ответа сервера. Локи не пересчитываем
// здесь (это знает только бэк); onSuccess подменит строку целиком через mergeMatrixRow.
export function optimisticToggle(matrix: MatrixRead, eventId: string, channel: ChannelKey, isEnabled: boolean): MatrixRead {
  return {
    ...matrix,
    events: matrix.events.map(row =>
      row.event_id === eventId ? { ...row, channels: { ...row.channels, [channel]: isEnabled } } : row,
    ),
  };
}

// Ответ PATCH /events — строка матрицы целиком (свежие locked/locked_channels).
export function mergeMatrixRow(matrix: MatrixRead, row: MatrixEventRow): MatrixRead {
  return { ...matrix, events: matrix.events.map(r => (r.event_id === row.event_id ? row : r)) };
}
