import { Reveal } from "./primitives";

// Здесь стояли «2 400+ бизнесов», «14.2M записей», «99.9% uptime» и рейтинг
// 4.9 — ни одну из этих цифр подтвердить нечем. Заменены на факты продукта,
// каждый из которых проверяется по коду: TRIAL_DAYS (auth/onboarding.py),
// список модулей ниже на странице, каналы записи (BookingChannelConfig),
// цена «Старта» (routers/billing/plans.py).
const STATS = [
  { value: "14 дней", label: "Бесплатно, без карты" },
  { value: "16", label: "Модулей в любом тарифе" },
  { value: "4", label: "Канала онлайн-записи" },
  { value: "от 39 €", label: "В месяц за студию", invert: true },
];

const TRUST = [
  "Данные принадлежат вам",
  "Роли и доступы на сервере",
  "Экспорт CSV в любой момент",
  "Удаление по запросу",
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
