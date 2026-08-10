/* Палитра лендинга задана литералами (#101010 / #FDFCFB / #F9A08B) прямо в
   классах секций, а не токенами темы. Это единственное место в проекте, где
   так и надо: маркетинговая страница всегда чёрно-бело-персиковая и не должна
   переворачиваться вместе с `.dark` кабинета. Персиковый — тот же, что в ДС.

   Лежит отдельно от primitives.tsx: react-refresh требует, чтобы файл с
   компонентами экспортировал только компоненты. */

/** Общий «дорогой» безье для входов — один на весь лендинг. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Кнопка-призрак поверх чёрных секций: на hover инвертируется в белую. */
export const GHOST_ON_DARK =
  "inline-flex items-center justify-center rounded-xl border border-white/20 px-8 py-4 " +
  "text-[15px] font-semibold text-white transition-all duration-300 " +
  "hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-[#101010]";
