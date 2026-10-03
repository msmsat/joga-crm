/**
 * Доступная высота окна в `--app-h`, измеренная до первого кадра.
 *
 * Документ не прокручивается: внутри рамы прокручивается только .app-scroll.
 * При сворачивании панели вебвью рама теперь растёт вместе с видимой областью:
 * заморозка первого замера оставляла пустую полосу под меню в Instagram.
 * Клавиатура и масштабирование не должны менять основную раскладку.
 */

// При закрытии клавиатуры фокус может исчезнуть раньше, чем она уедет.
// Обычная панель браузера забирает значительно меньше места.
const CHROME_MAX = 160;

let width = window.innerWidth;
let keyboardOpen = false;
let keyboardContracted = false;

const availableHeight = () => {
  const viewport = window.visualViewport;
  // visualViewport учитывает панели iOS-вебвью, которые не меняют innerHeight.
  // Без него (старые браузеры) сохраняется обычный замер окна.
  const visible = viewport && viewport.height > 0 ? viewport.height : window.innerHeight;
  return Math.round(visible);
};

let height = availableHeight();

const apply = () => {
  document.documentElement.style.setProperty('--app-h', `${height}px`);
};

const isEditing = () => Boolean(document.activeElement?.matches(
  'textarea, input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), [contenteditable]:not([contenteditable="false"])',
));

const measure = () => {
  const viewport = window.visualViewport;
  // Пинч-зум уменьшает видимую область, но не размер макета. Масштабирование
  // остаётся доступным; меню не сдвигается вслед за увеличенным фрагментом.
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
      // Начальные кадры клавиатуры тоже не уменьшают раму. После полного
      // открытия её закрытие можно распознать, даже если поле держит фокус.
      if (!keyboardContracted || reduction > CHROME_MAX) {
        keyboardOpen = true;
        return;
      }
    }
    if (keyboardOpen && reduction > CHROME_MAX) return;
    keyboardOpen = false;
    keyboardContracted = false;
  }

  if (nextHeight === height) return;
  height = nextHeight;
  apply();
};

apply();
window.addEventListener('resize', measure);
window.addEventListener('focusout', measure);
window.visualViewport?.addEventListener('resize', measure);

/** Экспорт для проверки; приложение импортирует модуль ради побочного эффекта. */
export { measure as __measure };
