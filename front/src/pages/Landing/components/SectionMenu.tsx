import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EASE } from "./tokens";

/**
 * Навигация по странице для телефона и планшета.
 *
 * Ряд ссылок в шапке включается только с 1024px (`hidden lg:flex` в Chrome), а
 * ниже страницу в девять экранов можно было пройти лишь прокруткой: до тарифов,
 * про которые спрашивают чаще всего, приходилось пролистать всё остальное.
 *
 * Список — ровно шесть пронумерованных глав страницы (номера те же, что печатает
 * ChapterHead): человек видит на экране «04 / 06» и находит в меню ту же
 * четвёртую. Порядок здесь обязан совпадать с порядком секций в Landing.tsx.
 * Подписи берутся из уже существующих ключей шапки и подвала — второй словарь
 * для тех же самых названий разъехался бы с первым.
 */
const SECTIONS: { href: string; label: string }[] = [
  { href: "#difference", label: "footer.columns.company.difference" },
  { href: "#product", label: "nav.product" },
  { href: "#modules", label: "nav.modules" },
  { href: "#pricing", label: "nav.pricing" },
  { href: "#faq", label: "nav.faq" },
  { href: "#about", label: "footer.columns.company.about" },
];

export interface SectionMenuProps {
  /** Регистрация: в шапке её кнопки больше нет — см. комментарий у пункта. */
  onRegister: () => void;
}

export function SectionMenu({ onRegister }: SectionMenuProps) {
  const { t } = useTranslation("landing");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику мимо и по Esc — оба слушателя живут только пока меню
  // открыто (тот же приём, что у LangSwitch рядом).
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

  return (
    <div ref={boxRef} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.sections")}
        className={`flex items-center rounded-lg border px-2.5 py-2 transition-colors duration-300 ${
          open
            ? "border-[#F9A08B]/50 bg-white/[0.06] text-white"
            : "border-white/12 text-white/70 hover:border-white/25 hover:text-white"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
          {open ? (
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          ) : (
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            data-lenis-prevent
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[224px] rounded-xl border border-white/10 bg-[#181818] p-1.5 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.8)]"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#F9A08B]">
              {t("nav.sections")}
            </p>

            {/* Закрываем на всплытии: переход по якорю и так уводит взгляд
                вниз страницы, оставлять поверх него открытую панель незачем. */}
            <div onClick={() => setOpen(false)}>
              {SECTIONS.map((s, i) => (
                <a
                  key={s.href}
                  href={s.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-white/60 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="font-mono text-[11px] tabular-nums text-white/25">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1">{t(s.label)}</span>
                </a>
              ))}
            </div>

            {/* Регистрация — здесь: из шапки персиковую кнопку убрали, чтобы в
                ней осталось одно действие («Войти»), и меню стало вторым входом
                для тех, кто аккаунт ещё не завёл. Подпись та же, что была у
                кнопки в шапке, — действие не должно менять имя. Вошедшего она
                уводит в кабинет, а не на форму регистрации (entry.ts). */}
            <div className="mt-1.5 border-t border-white/10 pt-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); onRegister(); }}
                className="w-full rounded-lg bg-[#F9A08B]/12 px-3 py-2.5 text-left text-[13.5px] font-bold text-[#F9A08B] transition-colors duration-200 hover:bg-[#F9A08B]/20"
              >
                {t("nav.startFull")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
