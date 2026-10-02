/**
 * Прогрев шрифта — в простое после загрузки, а не в момент открытия листа.
 *
 * Manrope едет файлами по начертаниям и алфавитам (@fontsource, unicode-range),
 * и браузер грузит, разбирает и готовит каждое сочетание «начертание + алфавит
 * + кегль» только при первом показе. Главная показывает их немного, а лист
 * записи — десяток новых сразу. Всё это шло синхронно, внутри раскладки при
 * открытии: замерено 300+ мс при CPU ×4 (загрузка и создание шрифта ~115 мс,
 * первичная укладка текста ~85 мс) — лист вставал с заметным рывком.
 *
 * Здесь те же сочетания укладываются один раз невидимо, когда приложению
 * нечем заняться: дальше браузер берёт готовое из кэша.
 */

import { whenIdle } from './idle';

/** Буквы всех пяти языков интерфейса: кириллица (вместе с украинской),
 *  чешские и немецкие знаки, цифры — с ними и табличные. */
const SAMPLE = 'Аа Яя Ёё Її Єє Ґґ Ščř Ýá Äöüß Aa Zz 09:30 · —';

const WEIGHTS = [400, 500, 600, 700, 800];

/** Кегли листов записи и их подвала: всё, что встречается в разметке мастеров. */
const SIZES = [8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 21, 27];

/** Без requestIdleCallback (Safari, вебвью Telegram на iOS) — позже анимации входа главной. */
const FALLBACK_DELAY_MS = 1500;


/** Уложить одно начертание во всех кеглях — невидимо, и сразу убрать. */
function warmWeight(weight: number): void {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;'
    + `font-family:Manrope,system-ui,sans-serif;font-weight:${weight}`;
  for (const size of SIZES) {
    for (const tabular of [false, true]) {
      const line = document.createElement('div');
      line.textContent = SAMPLE;
      line.style.fontSize = `${size}px`;
      if (tabular) line.style.fontVariantNumeric = 'tabular-nums';
      host.appendChild(line);
    }
  }
  document.body.appendChild(host);
  // Укладка — здесь и сейчас, в простое: она и готовит шрифт.
  void host.offsetHeight;
  host.remove();
}

/**
 * Запустить прогрев, когда браузеру будет нечем заняться. По начертанию за
 * раз, каждое — в своём окне простоя: прогрев целиком сам стал бы длинной
 * задачей, и тап, пришедшийся на неё, ждал бы её конца.
 */
export function warmFontsWhenIdle(): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  whenIdle(async () => {
    try {
      // Сначала файлы: укладка до их прихода прогрела бы запасной шрифт.
      await Promise.all(WEIGHTS.map((weight) => document.fonts.load(`${weight} 16px Manrope`, SAMPLE)));
    } catch {
      // Не вышло — шрифт подготовится при первом показе, как и раньше.
      return;
    }
    const next = (index: number) => {
      if (index >= WEIGHTS.length) return;
      warmWeight(WEIGHTS[index]);
      whenIdle(() => next(index + 1), 120);
    };
    next(0);
  }, FALLBACK_DELAY_MS);
}
