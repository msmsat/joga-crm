import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* «ЧЧ:ММ» из местного времени студии — `timeOf` в lib/slots.ts, рядом с
   остальной арифметикой дней записи. */
