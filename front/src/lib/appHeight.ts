/**
 * Видимая высота окна телефона — для нижнего дока кабинета (MobileNav).
 *
 * Логика замера — та же, что у мини-приложения (miniapp/src/lib/appHeight.ts):
 * visualViewport, а не innerHeight, потому что iOS-вебвью (Instagram, Telegram,
 * встроенные браузеры почты) кладут свою нижнюю панель ПОВЕРХ страницы и
 * innerHeight от этого не меняют. Клавиатура и пинч-зум раскладку не трогают:
 * док не должен прыгать над клавиатурой и ездить за увеличенным фрагментом.
 *
 * Пишет две переменные на <html>:
 *   --app-h   — видимая высота (по ней док выбирает зазор над краем);
 *   --app-cut — сколько низа окна перекрыто чужой панелью. Кабинет держит раму
 *               в 100dvh и всё, что прижато к низу (`position: fixed; bottom`),
 *               считает от низа ОКНА, — поэтому перекрытая полоса прибавляется
 *               к отступу дока (--mnav-inset), и вместе с ним поднимается всё,
 *               что стоит над доком: панели, подвалы, тосты.
 */

// При закрытии клавиатуры фокус может исчезнуть раньше, чем она уедет.
// Обычная панель браузера забирает значительно меньше места.
const CHROME_MAX = 160;

let width = window.innerWidth;
let keyboardOpen = false;
let keyboardContracted = false;

const availableHeight = () => {
  const viewport = window.visualViewport;
  const visible = viewport && viewport.height > 0 ? viewport.height : window.innerHeight;
  return Math.round(visible);
};

let height = availableHeight();

const apply = () => {
  const root = document.documentElement.style;
  root.setProperty('--app-h', `${height}px`);
  // Разница в пиксель-другой — округление, а не панель.
  const cut = window.innerHeight - height;
  root.setProperty('--app-cut', `${cut > 2 ? cut : 0}px`);
};

const isEditing = () => Boolean(document.activeElement?.matches(
  'textarea, input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), [contenteditable]:not([contenteditable="false"])',
));

const measure = () => {
  const viewport = window.visualViewport;
  if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;

  const nextHeight = availableHeight();

  if (window.innerWidth !== width) {
    width = window.innerWidth;
    keyboardOpen = false;
    keyboardContracted = false;
  } else {
    const reduction = height - nextHeight;
    if (isEditing() && reduction > 0) {
      if (reduction > CHROME_MAX) keyboardContracted = true;
      if (!keyboardContracted || reduction > CHROME_MAX) {
        keyboardOpen = true;
        return;
      }
    }
    if (keyboardOpen && reduction > CHROME_MAX) return;
    keyboardOpen = false;
    keyboardContracted = false;
  }

  height = nextHeight;
  apply();
};

apply();
window.addEventListener('resize', measure);
window.addEventListener('focusout', measure);
window.visualViewport?.addEventListener('resize', measure);
