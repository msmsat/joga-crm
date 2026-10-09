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

import { whenIdle, whenIdleSteps } from './idle';

/** Буквы всех пяти языков интерфейса: кириллица (вместе с украинской),
 *  чешские и немецкие знаки, цифры — с ними и табличные. */
const SAMPLE = 'Аа Яя Ёё Її Єє Ґґ Ščř Ýá Äöüß Aa Zz 09:30 · —';

const WEIGHTS = [400, 500, 600, 700, 800];

/** Кегли листов записи и их подвала: всё, что встречается в разметке мастеров. */
const SIZES = [8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 21, 27];

/** Без requestIdleCallback (Safari, вебвью Telegram на iOS) — позже анимации входа главной. */
const FALLBACK_DELAY_MS = 1500;

/** Первый шаг укладки — не раньше этого после прихода файлов. */
const STEP_DELAY_MS = 120;


/**
 * Уложить одно сочетание «начертание + кегль» (с обычными и табличными
 * цифрами) — невидимо, в общей подложке прогрева.
 *
 * Шаг маленький намеренно. Раньше за раз укладывалось начертание во всех
 * восемнадцати кеглях: пять задач по ~180 мс при CPU ×4, и все — в первые
 * секунды после открытия, ровно когда человек уже листает и тапает. Тап,
 * попавший на такую задачу, ждал её конца. Теперь шагов девяносто, каждый —
 * пара строк (~10 мс при ×4), и `whenIdleSteps` берёт их столько, сколько
 * влезает в окно простоя.
 */
function warmStep(host: HTMLElement, weight: number, size: number): void {
  for (const tabular of [false, true]) {
    const line = document.createElement('div');
    line.textContent = SAMPLE;
    line.style.fontWeight = String(weight);
    line.style.fontSize = `${size}px`;
    if (tabular) line.style.fontVariantNumeric = 'tabular-nums';
    host.appendChild(line);
  }
  // Укладка — здесь и сейчас, в простое: она и готовит шрифт.
  void host.offsetHeight;
  host.replaceChildren();
}

/**
 * Запустить прогрев, когда браузеру будет нечем заняться: сначала файлы
 * начертаний, потом укладка — по сочетанию за шаг (`warmStep`).
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
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    // `contain: strict` — укладка подложки не трогает остальную страницу.
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1000px;height:100px;contain:strict;visibility:hidden;'
      + 'pointer-events:none;white-space:nowrap;font-family:Manrope,system-ui,sans-serif';
    document.body.appendChild(host);
    const steps = WEIGHTS.flatMap((weight) => SIZES.map((size) => () => warmStep(host, weight, size)));
    steps.push(() => host.remove());
    whenIdleSteps(steps, STEP_DELAY_MS);
  }, FALLBACK_DELAY_MS);
}
