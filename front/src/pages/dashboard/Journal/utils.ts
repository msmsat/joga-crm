// utils.ts
import type { Booking } from './types';

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