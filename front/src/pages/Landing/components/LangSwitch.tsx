import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LANGUAGES, rememberLang } from "../../../utils/lang";
import { EASE } from "./tokens";

/**
 * Выбор языка в шапке лендинга. Продукт международный: страница открывается
 * по-английски у всех, кто ещё не выбирал, а этот переключатель — единственное
 * место до входа, где язык можно сменить. Выбор запоминается (utils/lang.ts),
 * поэтому возврат на страницу не сбрасывает его обратно на английский.
 *
 * Подписи — на самих языках («Čeština», не «Чешский»): человек ищет строку,
 * которую узнаёт, а не её перевод на язык, которого не знает.
 */
export function LangSwitch() {
  const { t, i18n } = useTranslation("landing");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.value === i18n.language) ?? LANGUAGES[0];

  // Закрытие по клику мимо и по Esc — оба слушателя живут только пока список
  // открыт, иначе страница держала бы их на каждой прокрутке впустую.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(code: string) {
    i18n.changeLanguage(code);
    rememberLang(code);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("nav.language")}: ${current.label}`}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-colors duration-300 sm:px-3 ${
          open
            ? "border-[#F9A08B]/50 bg-white/[0.06] text-white"
            : "border-white/12 text-white/70 hover:border-white/25 hover:text-white"
        }`}
      >
        {/* Глобус, а не флаг: Windows не рисует региональные индикаторы, и
            «🇬🇧 EN» превращается в «GB EN» — код языка дважды. Флаги остались
            в списке ниже, рядом с названием языка, где они не дублируются. */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
          <ellipse cx="8" cy="8" rx="2.7" ry="6.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.1 6h11.8M2.1 10h11.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {/* На телефоне в шапке помещаются логотип, «Войти» и CTA — код языка
            и стрелка уходят, глобус остаётся: кнопка сжимается до 34px.
            По-немецки строка «Anmelden» длиннее русской, и без этого CTA
            выезжал за правый край на 375px. */}
        <span className="hidden uppercase tracking-[0.06em] sm:inline">{current.value}</span>
        <motion.svg
          width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="hidden opacity-50 sm:block"
        >
          <path d="m1.5 3.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[178px] overflow-hidden rounded-xl border border-white/10 bg-[#181818] p-1.5 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.8)]"
          >
            {LANGUAGES.map(l => {
              const active = l.value === current.value;
              return (
                <li key={l.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => pick(l.value)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors duration-200 ${
                      active ? "bg-[#F9A08B]/12 text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <span className="text-[15px] leading-none">{l.flag}</span>
                    <span className="flex-1">{l.label}</span>
                    {active && (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden className="text-[#F9A08B]">
                        <path d="m2.5 7.4 3 3L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
