import { useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg } from "./Illustrations";

// Единственный источник истины о ценах и лимитах — back/routers/billing/plans.py
// (SEAT_BASE / SEAT_STEP / UNLIMITED_PRICE / _limits). Здесь тот же прайс
// формулой, а не тремя выдуманными коробками: витрина обязана показывать ту же
// линию мест, что и кабинет (/dashboard/billing), иначе человек платит не за то,
// что ему обещала страница. При смене цен правим оба места.
//
// Раньше тут стояли рубли (990 / 2 490 / 5 990 ₽) и список фич, которых в
// продукте нет: White-label, API, SLA, выделенный менеджер. Обещать их со
// страницы, где рядом кнопка оплаты, нельзя.
const MIN_SEATS = 2;
const MAX_SEATS = 20;
const SEAT_BASE = 15;   // € / мес за MIN_SEATS мест
const SEAT_STEP = 5;    // + за каждое место сверх минимума
const UNLIMITED_PRICE = 120;
const UNLIMITED_AI = 5000;
const CLIENTS_PER_SEAT = 100;
const AI_PER_SEAT = 150;
/** Позиция ползунка за последней ступенью — безлимит («∞» на конце линии). */
const UNLIMITED_POS = MAX_SEATS + 1;

/** Скидки за период оплаты — PERIOD_DISCOUNTS из plans.py. */
const PERIODS = [
  { months: 1, off: 0 },
  { months: 3, off: 0.15 },
  { months: 6, off: 0.25 },
  { months: 12, off: 0.4 },
];

const MODELS = [
  { title: "Подписка", price: "от 15 € / мес", desc: "Фиксированная сумма. Знаете расход заранее — никаких сюрпризов в конце месяца." },
  { title: "3% с выручки", price: "минимум 15 € / мес", desc: "Платите с оборота. В пустой месяц доплачиваете только разницу до минимума." },
  { title: "Комбо", price: "½ фикса + 1.5%", desc: "Половина подписки плюс небольшой процент — компромисс между двумя моделями." },
];

const money = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const round2 = (value: number) => Math.round(value * 100) / 100;
/** Мест на линии всего 2..20 — форм слова нужно ровно две. */
const seatWord = (seats: number) => (seats < 5 ? "сотрудника" : "сотрудников");

export function Pricing() {
  const navigate = useNavigate();
  // Открываем на середине линии: и цена входа, и потолок остаются в двух
  // движениях пальца, а не «ползунок в углу, крутите сами».
  const [pos, setPos] = useState(10);
  const [period, setPeriod] = useState(12);

  const seats = pos > MAX_SEATS ? null : pos;
  const monthly = seats === null ? UNLIMITED_PRICE : SEAT_BASE + (seats - MIN_SEATS) * SEAT_STEP;
  const off = PERIODS.find(p => p.months === period)?.off ?? 0;
  const perMonth = round2(monthly * (1 - off));
  const total = round2(perMonth * period);
  const saved = round2(monthly * period - total);
  const fill = ((pos - MIN_SEATS) / (UNLIMITED_POS - MIN_SEATS)) * 100;

  // Что именно даёт выбранная ступень — теми же числами, что считает _limits().
  const rows: [string, string, boolean?][] = [
    seats === null
      ? ["Сотрудники", "без ограничений"]
      : ["За одного сотрудника", `${money(round2(perMonth / seats))} € / мес`],
    ["Клиентов в базе", seats === null ? "без ограничений" : `до ${(seats * CLIENTS_PER_SEAT).toLocaleString("ru-RU")}`],
    ["Обращений к Velora AI", `${(seats === null ? UNLIMITED_AI : seats * AI_PER_SEAT).toLocaleString("ru-RU")} / мес`],
    ["Модулей", "все 16"],
  ];
  if (period > 1) {
    rows.push([`К оплате за ${period} мес.`, `${money(total)} €`]);
    rows.push(["Экономия", `${money(saved)} €`, true]);
  }

  return (
    <section id="pricing" className="scroll-mt-24 bg-[#FDFCFB] py-24 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="тарифы"
          index={4}
          tone="light"
          title={<>Тариф — это<br />число сотрудников</>}
          lead="15 € за двоих, каждое следующее место +5 €, безлимит — 120 €. Все 16 модулей и Velora AI входят в любую ступень: вы платите за размер команды, а не за разблокировку кнопок. Три модели оплаты на выбор, при оплате вперёд — скидка до 40%."
        />

        {/* Калькулятор: та же линия мест, что в кабинете, — только здесь она и
            есть витрина. Три карточки «Старт / Про / Бизнес» пришлось бы
            держать в синхроне с двадцатью ступенями сервера вручную. */}
        <Reveal className="mt-14">
          <div className="relative overflow-hidden rounded-[24px] bg-[#101010] p-5 sm:p-9 lg:p-12">
            <GridBg />
            <div className="lp-glow pointer-events-none absolute -right-20 -top-24 h-[340px] w-[340px]" />

            <div className="relative grid gap-7 sm:gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(280px,350px)] lg:gap-14">
              {/* ── Выбор: места и период ── */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#F9A08B]">команда</span>

                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-[clamp(46px,8vw,64px)] font-black leading-none tracking-[-0.045em] text-white tabular-nums">
                    {seats ?? "∞"}
                  </span>
                  <span className="text-[14px] font-medium text-white/40">
                    {seats === null ? "без ограничений" : seatWord(seats)}
                  </span>
                </div>

                <input
                  type="range"
                  min={MIN_SEATS}
                  max={UNLIMITED_POS}
                  step={1}
                  value={pos}
                  onChange={e => setPos(Number(e.target.value))}
                  aria-label="Сколько сотрудников в студии"
                  className="lp-range mt-8"
                  style={{ "--fill": `${fill}%` } as CSSProperties}
                />
                <div className="mt-3 flex justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/25">
                  <span>2 места</span>
                  <span>∞ безлимит</span>
                </div>

                <p className="mt-6 text-[13px] leading-[1.7] text-white/45">
                  <span className="font-bold text-white">15 €</span> за двоих, каждое следующее место{" "}
                  <span className="font-bold text-white">+5 €</span>. Безлимит —{" "}
                  <span className="font-bold text-white">120 €</span> в месяц.
                </p>

                <div className="mt-9 h-px w-full bg-white/10" />

                <span className="mt-9 block text-[11px] font-bold uppercase tracking-[0.22em] text-[#F9A08B]">период оплаты</span>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {PERIODS.map(p => {
                    const active = p.months === period;
                    return (
                      <button
                        key={p.months}
                        onClick={() => setPeriod(p.months)}
                        aria-pressed={active}
                        className={`rounded-xl border px-1.5 py-3 text-center transition-colors duration-300 ${
                          active ? "border-[#F9A08B] bg-[#F9A08B]/12" : "border-white/12 hover:border-white/30"
                        }`}
                      >
                        <span className={`block text-[12px] font-bold sm:text-[13px] ${active ? "text-white" : "text-white/70"}`}>
                          {p.months} мес
                        </span>
                        <span className={`mt-1 block text-[10.5px] font-bold ${p.off ? "text-[#A3C9A8]" : "text-white/25"}`}>
                          {p.off ? `−${p.off * 100}%` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Итог: цена выбранной ступени ── */}
              <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#F9A08B]">ваша цена</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-[clamp(38px,6vw,50px)] font-black leading-none tracking-[-0.04em] text-[#F9A08B] tabular-nums">
                    {money(perMonth)} €
                  </span>
                  <span className="text-[13px] text-white/40">/ мес</span>
                </div>

                {off > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-[12px]">
                    <span className="text-white/30 line-through">{money(monthly)} €</span>
                    <span className="rounded-full bg-[#A3C9A8]/15 px-2 py-0.5 font-bold text-[#A3C9A8]">
                      −{off * 100}%
                    </span>
                  </div>
                )}

                <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
                  {rows.map(([label, value, accent]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                      <span className="text-white/40">{label}</span>
                      <span className={`font-bold tabular-nums ${accent ? "text-[#A3C9A8]" : "text-white"}`}>{value}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => navigate("/register")}
                  className="mt-6 w-full rounded-xl bg-[#F9A08B] py-3.5 text-[14px] font-bold text-[#101010] transition-transform duration-300 hover:-translate-y-0.5"
                >
                  Попробовать 14 дней
                </button>
                <p className="mt-3 text-center text-[11.5px] text-white/35">Без карты · отмена в один клик</p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Три модели оплаты ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {MODELS.map((m, i) => (
            <Reveal key={m.title} delay={i * 0.08} className="h-full">
              <div className="h-full rounded-2xl border border-[#101010]/8 bg-white p-6 lg:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[16px] font-bold text-[#101010]">{m.title}</h3>
                  <span className="shrink-0 text-[12px] font-bold text-[#F9A08B]">{m.price}</span>
                </div>
                <p className="mt-3 text-[13px] leading-[1.6] text-[#666]">{m.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <p className="mt-6 text-center text-[13px] leading-[1.7] text-[#888]">
            Пробный период — без карты. Модель оплаты и число мест меняются в кабинете в любой момент.
            Цены без НДС: налог считается при оплате по вашей стране.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
