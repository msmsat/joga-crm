import { useTranslation } from "react-i18next";
import { Reveal } from "./primitives";

// Здесь стояли «2 400+ бизнесов», «14.2M записей», «99.9% uptime» и рейтинг
// 4.9 — ни одну из этих цифр подтвердить нечем. Заменены на факты продукта,
// каждый из которых проверяется по коду: TRIAL_DAYS (auth/onboarding.py),
// список модулей ниже на странице, каналы записи (BookingChannelConfig),
// цена нижней ступени — 2 места (routers/billing/plans.py).
// Сами формулировки живут в локали (`stats.items`), четвёртая плитка —
// последняя в списке — рисуется на чёрном.
export function Stats() {
  const { t } = useTranslation("landing");
  const items = t("stats.items", { returnObjects: true }) as { value: string; label: string }[];
  const trust = t("stats.trust", { returnObjects: true }) as string[];

  return (
    <section className="bg-[#FDFCFB] py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        {/* gap-px поверх тёмной подложки даёт волосяные линии-разделители
            вместо рамок: воздух вместо «сетки в клетку». */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] bg-[#101010]/10 lg:grid-cols-4">
          {items.map((s, i) => {
            const invert = i === items.length - 1;
            return (
              <Reveal key={s.label} delay={i * 0.08} y={20}
                className={invert ? "h-full bg-[#101010]" : "h-full bg-[#FDFCFB]"}>
                <div className="px-6 py-9 lg:px-9 lg:py-11">
                  <div className={`text-[clamp(32px,4.4vw,50px)] font-black leading-none tracking-[-0.04em] ${invert ? "text-[#F9A08B]" : "text-[#101010]"}`}>
                    {s.value}
                  </div>
                  <div className={`mt-3 text-[13px] font-medium ${invert ? "text-white/45" : "text-[#666]"}`}>
                    {s.label}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {trust.map((text) => (
              <span key={text} className="flex items-center gap-2 text-[13px] font-medium text-[#888]">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="6.25" stroke="#F9A08B" strokeWidth="1.2" />
                  <path d="m4.4 7.2 1.9 1.9L9.8 5.6" stroke="#F9A08B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {text}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
