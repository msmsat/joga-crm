import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE } from "./tokens";

/** Въезд снизу при появлении в вьюпорте. Один раз — назад не прячем. */
export function Reveal({ children, delay = 0, y = 28, className }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Бесконечная лента ниш. Две одинаковые копии подряд, сдвиг ровно на -50%,
 * поэтому шов не виден. Промежуток живёт в padding самого элемента, а не в
 * `gap` контейнера: gap добавил бы лишний зазор только между копиями и лента
 * дёргалась бы на стыке.
 */
export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden bg-[#F9A08B] py-4">
      <motion.div
        className="flex w-max"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 34, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items].map((label, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-7 pr-7 text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#101010] sm:text-[14px]"
          >
            {label}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M5 0 6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8Z" fill="#101010" opacity="0.4" />
            </svg>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
