import { Reveal } from "./primitives";

const STATS = [
  { value: "2 400+", label: "Активных бизнесов" },
  { value: "14.2M", label: "Записей обработано" },
  { value: "99.9%", label: "Uptime за 2025" },
  { value: "4.9 / 5", label: "Средний рейтинг", invert: true },
];

const TRUST = [
  "Данные принадлежат вам",
  "Роли и доступы на сервере",
  "Экспорт в любой момент",
  "Резервные копии",
];

export function Stats() {
  return (
    <section className="bg-[#FDFCFB] py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        {/* gap-px поверх тёмной подложки даёт волосяные линии-разделители
            вместо рамок: воздух вместо «сетки в клетку». */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] bg-[#101010]/10 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} y={20}
              className={s.invert ? "h-full bg-[#101010]" : "h-full bg-[#FDFCFB]"}>
              <div className="px-6 py-9 lg:px-9 lg:py-11">
                <div className={`text-[clamp(32px,4.4vw,50px)] font-black leading-none tracking-[-0.04em] ${s.invert ? "text-[#F9A08B]" : "text-[#101010]"}`}>
                  {s.value}
                </div>
                <div className={`mt-3 text-[13px] font-medium ${s.invert ? "text-white/45" : "text-[#666]"}`}>
                  {s.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {TRUST.map((t) => (
              <span key={t} className="flex items-center gap-2 text-[13px] font-medium text-[#888]">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="6.25" stroke="#F9A08B" strokeWidth="1.2" />
                  <path d="m4.4 7.2 1.9 1.9L9.8 5.6" stroke="#F9A08B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
