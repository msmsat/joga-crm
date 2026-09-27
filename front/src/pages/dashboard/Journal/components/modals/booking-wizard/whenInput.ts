// Своё время в разделе «Время» мастера записи (TimeStep): маска по мере
// набора и разбор в «ЧЧ:ММ».
/** Цифры → «ЧЧ:ММ» по мере набора. Час с 3 однозначный: «9» → «09», и «930»
    читается как 09:30, а не «93:0». */
export const maskTime = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (/^[3-9]/.test(d)) d = `0${d}`;
  d = d.slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
const pad = (n: number) => String(n).padStart(2, '0');

/** «9», «930», «09:30», «1230» → «ЧЧ:ММ»; вне суток — null. */
export function parseTime(text: string): string | null {
  const d = text.replace(/\D/g, '');
  if (!d || d.length > 4) return null;
  const [h, m] = d.length <= 2 ? [Number(d), 0] : [Number(d.slice(0, d.length - 2)), Number(d.slice(-2))];
  return h <= 23 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;
}
