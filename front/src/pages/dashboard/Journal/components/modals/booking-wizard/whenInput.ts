// Ввод даты и времени цифрами в мини-окне мастера записи (WhenPicker):
// маски по мере набора и разбор в ISO-дату и «ЧЧ:ММ».
/** Цифры → «ДД.ММ.ГГГГ» по мере набора. День с 4 и месяц с 2 однозначные —
    к ним сразу дописывается ноль: «5» → «05», «5.3» → «05.03». */
export const maskDate = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (/^[4-9]/.test(d)) d = `0${d}`;
  if (/^\d\d[2-9]/.test(d)) d = `${d.slice(0, 2)}0${d.slice(2)}`;
  d = d.slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.');
};
/** Цифры → «ЧЧ:ММ» по мере набора. Час с 3 однозначный: «9» → «09», и «930»
    читается как 09:30, а не «93:0». */
export const maskTime = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (/^[3-9]/.test(d)) d = `0${d}`;
  d = d.slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
const pad = (n: number) => String(n).padStart(2, '0');

/** «28.09.2026» или «28.09» (год — текущий) → «2026-09-28»; несуществующая дата — null. */
export function parseDate(text: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = m[3] ? Number(m[3]) : new Date().getFullYear();
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** «9», «930», «09:30», «1230» → «ЧЧ:ММ»; вне суток — null. */
export function parseTime(text: string): string | null {
  const d = text.replace(/\D/g, '');
  if (!d || d.length > 4) return null;
  const [h, m] = d.length <= 2 ? [Number(d), 0] : [Number(d.slice(0, d.length - 2)), Number(d.slice(-2))];
  return h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}

export const toText = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
