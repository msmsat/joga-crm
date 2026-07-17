// utils.ts
import type { Booking, Trainer, Lesson, Hall } from './types';
import type { StaffListItem } from '../../../api/staff/staff.types';

// ─── АЛГОРИТМ РАСПРЕДЕЛЕНИЯ (КЛАСТЕРЫ + УМНЫЕ ТРЕКИ) ──────────────
export function getBookingLayouts(bookings: Booking[]) {
  const layouts = new Map<number, any>();
  const RIGHT_SPACE = 28; // Отступ справа

  if (bookings.length === 0) return layouts;

  // 1. Сортируем: сначала по времени начала, затем длинные первыми
  const sortedBookings = [...bookings].sort((a, b) => {
    if (a.timeStart === b.timeStart) {
      return (b.timeEnd - b.timeStart) - (a.timeEnd - a.timeStart);
    }
    return a.timeStart - b.timeStart;
  });

  // 2. ФИЗИЧЕСКИЕ КЛАСТЕРЫ (Собираем всех, кто пересекается по времени)
  const clusters: Booking[][] = [];
  let currentCluster: Booking[] = [];
  let clusterEnd = -1;

  sortedBookings.forEach(b => {
    if (currentCluster.length === 0) {
      currentCluster.push(b);
      clusterEnd = b.timeEnd;
    } else {
      if (b.timeStart < clusterEnd) {
        currentCluster.push(b);
        clusterEnd = Math.max(clusterEnd, b.timeEnd);
      } else {
        clusters.push(currentCluster);
        currentCluster = [b];
        clusterEnd = b.timeEnd;
      }
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 3. УПАКОВКА ПО ТРЕКАМ (Идеальные колонки без наложений)
  clusters.forEach((cluster) => {
    const tracks: Booking[][] = []; 

    cluster.forEach(b => {
      let placed = false;
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const lastInTrack = track[track.length - 1];

        if (b.timeStart >= lastInTrack.timeEnd) {
          track.push(b);
          placed = true;
          break; 
        }
      }

      if (!placed) {
        tracks.push([b]);
      }
    });

    const N = tracks.length; 

    // 4. РАСЧЕТ КООРДИНАТ
    cluster.forEach((b) => {
      let trackIdx = 0;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].includes(b)) {
          trackIdx = i;
          break;
        }
      }

      let left, width, isCascade;

      if (N <= 3) {
        isCascade = false;
        if (N === 1) {
          left = '0px';
          width = `calc(100% - ${RIGHT_SPACE}px - ${trackIdx * 20}px)`;
        } else {
          left = `calc(((100% - ${RIGHT_SPACE}px) / ${N}) * ${trackIdx})`;
          width = `calc((100% - ${RIGHT_SPACE}px) / ${N} - 2px)`;
        }
      } 
      else {
        isCascade = true;
        const MIN_CARD_WIDTH = 40;
        const dynamicStep = `min(44px, (100% - ${RIGHT_SPACE + MIN_CARD_WIDTH}px) / ${N - 1})`;
        
        left = `calc(${dynamicStep} * ${trackIdx})`;
        width = `calc(100% - ${RIGHT_SPACE}px - (${dynamicStep} * ${trackIdx}))`;
      }

      const zIndex = 100 + (trackIdx * 1000) - Math.round(b.timeStart * 10);

      layouts.set(b.id, {
        left,
        width,
        zIndex, 
        isTracked: N > 1,
        isCascade: isCascade,
        totalTracks: N,
        trackIdx: trackIdx
      });
    });
  });

  return layouts;
}

// ─── УТИЛИТЫ РАБОТЫ СО ВРЕМЕНЕМ ──────────────────────────────────────────

export const formatIndexToTimeStr = (idx: number) => {
  const h = Math.floor(idx) + 7;
  const m = Math.round((idx % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const parseTimeToIndex = (timeStr: string) => {
  const clean = timeStr.replace(/[^\d:]/g, '');
  let h = 0, m = 0;
  if (clean.includes(':')) {
    const parts = clean.split(':');
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else if (clean.length > 0) {
    if (clean.length <= 2) {
      h = Number(clean);
    } else if (clean.length === 3) {
      h = Number(clean.slice(0, 1));
      m = Number(clean.slice(1, 3));
    } else {
      h = Number(clean.slice(0, 2));
      m = Number(clean.slice(2, 4));
    }
  }
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;
  if (h > 23) h = 23;
  if (m > 59) m = 59;
  return (h - 7) + (m / 60);
};

export const generateTimeIntervals = (stepMinutes: number = 15): string[] => {
  const intervals: string[] = [];
  for (let h = 7; h <= 23; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      if (h === 23 && m > 0) break; // Заканчиваем ровно в 23:00
      intervals.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return intervals;
};

// ─── ПЕРЕХОДНИК API ↔ СЕТКА ЖУРНАЛА ──────────────────────────────────────
// Сетка живёт на индексах времени: 0 = 07:00, 1 единица = 1 час.

export const TRAINER_COLORS = ['#F9A08B', '#5BAB72', '#40a8a0', '#4A80C4', '#7B6CD4'];

const hexToBg = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.12)`;
};

// Цвет по id — стабилен между заходами, не съезжает при фильтрации/увольнении других сотрудников.
export const colorForStaffId = (id: number) => TRAINER_COLORS[id % TRAINER_COLORS.length];

// Сотрудник из API → колонка журнала.
export const staffToTrainer = (s: StaffListItem): Trainer => {
  const color = colorForStaffId(s.id);
  const first = s.name || '';
  const last = s.last_name || '';
  return {
    id: s.id,
    name: last ? `${first} ${last[0]}.` : first,
    full: `${first} ${last}`.trim(),
    role: s.department || s.role,
    color,
    bg: hexToBg(color),
    initials: (`${first[0] ?? ''}${last[0] ?? ''}`).toUpperCase() || '?',
  };
};

// Локальная дата YYYY-MM-DD (toISOString сдвинул бы день из-за UTC)
export const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Занятие из API → карточка сетки. start_time от бэка — naive ISO (локальное время студии).
export const lessonToBooking = (l: Lesson, halls: Hall[], colorByTeacher: Map<number, string>): Booking => {
  const start = new Date(l.start_time);
  const timeStart = start.getHours() - 7 + start.getMinutes() / 60;
  return {
    id: l.id,
    trainer: l.teacher_id ?? -1,
    timeStart,
    timeEnd: timeStart + l.duration_min / 60,
    title: l.name,
    hall: halls.find(h => h.id === l.hall_id)?.name ?? '',
    clients: l.booked_count ?? 0,
    maxClients: l.total_spots,
    color: (l.teacher_id != null ? colorByTeacher.get(l.teacher_id) : undefined) ?? TRAINER_COLORS[0],
    status: l.status,
    date: toDateStr(start),
  };
};

// Обратный переходник: дата + индекс сетки → naive ISO (для create/update занятия)
export const indexToDateTime = (dateStr: string, idx: number) => {
  const h = Math.floor(idx) + 7;
  const m = Math.round((idx % 1) * 60);
  return `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

// Самопроверка переходника (только dev-сборка)
if (import.meta.env.DEV) {
  const b = lessonToBooking(
    { id: 1, name: 'Т', teacher_id: 5, teacher_name: null, hall_id: 2, start_time: '2026-07-12T08:30:00', duration_min: 90, price: 0, total_spots: 8, booked_count: 3, status: 'confirmed', level: null },
    [{ id: 2, name: 'Зал 1', color: '', capacity: 8, is_online: false, is_active: true }],
    new Map([[5, '#5BAB72']]),
  );
  console.assert(
    b.timeStart === 1.5 && b.timeEnd === 3 && b.hall === 'Зал 1' && b.date === '2026-07-12' && b.clients === 3,
    'lessonToBooking сломан:', b,
  );
  console.assert(indexToDateTime('2026-07-12', 1.5) === '2026-07-12T08:30:00', 'indexToDateTime сломан');
}