import { useEffect, useState } from 'react';

/** Та же граница, что и у блока «ТЕЛЕФОН» в App.css. */
const PHONE = '(max-width: 767px)';

/**
 * Телефон или нет. Нужен там, где на телефоне меняется не раскладка, а сам
 * набор компонентов, и медиазапросом это не выразить (страница Velora AI
 * показывает на телефоне интерфейс AI-дровера вместо двухколоночного).
 */
export function usePhone() {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE).matches);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}
