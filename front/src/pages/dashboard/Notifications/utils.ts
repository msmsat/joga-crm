import type { ChannelKey } from './types';
import type { MatrixRead, MatrixEventRow } from '../../../api/notifications/notifications.types';

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
