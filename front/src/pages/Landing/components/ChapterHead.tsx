import type { ReactNode } from "react";
import { Reveal } from "./primitives";

// Глав шесть: «что говорят» ушла вместе с выдуманными отзывами.
export const CHAPTERS = 6;

/**
 * Шапка главы: `\ метка` слева, номер главы справа, волосяная линия, заголовок.
 * Нумерация — главный приём ритма на длинной странице: читатель всё время
 * понимает, где он и сколько осталось.
 */
export function ChapterHead({
  label, index, title, lead, tone = "dark", align = "left",
}: {
  label: string;
  index: number;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "dark" | "light";
  align?: "left" | "center";
}) {
  const dark = tone === "dark";
  const centered = align === "center";

  return (
    <Reveal className={centered ? "mx-auto max-w-[720px] text-center" : "max-w-[720px]"}>
      <div className={`flex items-baseline justify-between gap-6 ${centered ? "mx-auto" : ""}`}>
        <span className="flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F9A08B]">
          <span className="opacity-50">\</span>
          {label}
        </span>
        <span className={`shrink-0 font-mono text-[11px] tabular-nums ${dark ? "text-white/30" : "text-[#101010]/30"}`}>
          {String(index).padStart(2, "0")} / {String(CHAPTERS).padStart(2, "0")}
        </span>
      </div>

      <div className={`mt-4 h-px w-full ${dark ? "bg-white/12" : "bg-[#101010]/10"}`} />

      <h2 className={`mt-8 text-[clamp(30px,4.2vw,50px)] font-black leading-[1.06] tracking-[-0.035em] ${dark ? "text-white" : "text-[#101010]"}`}>
        {title}
      </h2>

      {lead && (
        <p className={`mt-5 text-[15px] leading-[1.75] lg:text-[16px] ${dark ? "text-white/50" : "text-[#666]"} ${centered ? "mx-auto max-w-[560px]" : "max-w-[560px]"}`}>
          {lead}
        </p>
      )}
    </Reveal>
  );
}
