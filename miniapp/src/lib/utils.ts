import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * «ЧЧ:ММ» из наивного местного времени студии (`2027-06-16T09:00:00`).
 *
 * Срезом, а не через `new Date()`: строка без смещения была бы прочитана в
 * поясе телефона, и клиент из другой страны увидел бы чужой час (AC-21).
 * Тот же приём — в ResourceBookingSheet для `local_start` слота.
 */
export const hhmm = (localStart: string) => localStart.slice(11, 16);
