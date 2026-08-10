import { useEffect, useState } from 'react';

/** Та же граница, что у breakpoint `dt` в index.css. Держать в паре. */
const QUERY = '(min-width: 760px)';

/**
 * Ширина экрана — десктопная?
 *
 * Почти вся адаптация делается классами `dt:` и JS не требует. Хук нужен там,
 * где раскладку решает не CSS: анимация листа (снизу на телефоне, масштабом в
 * центре на десктопе), смахивание вниз, и выбор самого меню — держать в DOM
 * оба было бы нельзя, framer связал бы их общий layoutId в один переезд.
 *
 * Начальное значение читается синхронно, иначе первый кадр всегда телефонный.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setIsDesktop(media.matches);

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}
