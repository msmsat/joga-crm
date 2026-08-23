import { useNavigate } from "react-router-dom";
import { Check } from "../../../components/Icons";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";

// Единственный источник истины о ценах и лимитах — back/routers/billing/plans.py
// (2 места — 15 €, каждое следующее +5 €, безлимит — 120 €; лимиты staff,
// clients, ai_requests). Витрина здесь статическая и показывает ТРИ ступени
// из двадцати — в кабинете вся линия приходит с сервера. При смене цен правим
// оба места. Раньше тут стояли рубли (990 / 2 490 / 5 990 ₽) и список фич,
// которых в продукте нет: White-label, API, SLA, выделенный менеджер. Обещать
// их со страницы, где рядом кнопка оплаты, нельзя.
const MODELS = [
  { title: "Подписка", price: "от 15 € / мес", desc: "Фиксированная сумма. Знаете расход заранее — никаких сюрпризов в конце месяца." },
  { title: "3% с выручки", price: "минимум 15 € / мес", desc: "Платите с оборота. В пустой месяц доплачиваете только разницу до минимума." },
  { title: "Комбо", price: "½ фикса + 1.5%", desc: "Половина подписки плюс небольшой процент — компромисс между двумя моделями." },
];

const PLANS = [
  {
    id: "s2", name: "2 сотрудника", price: "15", accent: false,
    for: "Одиночная студия, которая только запускается",
    features: ["2 сотрудника", "До 200 клиентов", "300 AI-обращений в месяц", "Все 16 модулей"],
  },
  {
    id: "s10", name: "10 сотрудников", price: "55", accent: true,
    for: "Растущая студия с командой и постоянным потоком",
    features: ["10 сотрудников", "До 1000 клиентов", "1500 AI-обращений в месяц", "Все 16 модулей"],
  },
  {
    id: "unlimited", name: "Безлимит", price: "120", accent: false,
    for: "Сеть филиалов с собственными процессами",
    features: ["Сотрудники без лимита", "Клиенты без лимита", "5000 AI-обращений в месяц", "Все 16 модулей"],
  },
];

export function Pricing() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="scroll-mt-24 bg-[#FDFCFB] py-24 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="тарифы"
          index={4}
          tone="light"
          title={<>Платите так,<br />как выгодно именно вам</>}
          lead="Тариф — это число сотрудников: 15 € за двоих и +5 € за каждого следующего. Три модели оплаты вместо одной навязанной, переключиться можно в любой момент, а при оплате вперёд действует скидка до 40%."
        />

        <div className="mt-14 grid gap-3 lg:grid-cols-3">
          {MODELS.map((m, i) => (
            <Reveal key={m.title} delay={i * 0.08} className="h-full">
              <div className="h-full rounded-2xl border border-[#101010]/8 bg-white p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[16px] font-bold text-[#101010]">{m.title}</h3>
                  <span className="text-[12px] font-bold text-[#F9A08B]">{m.price}</span>
                </div>
                <p className="mt-3 text-[13px] leading-[1.6] text-[#666]">{m.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-[24px] p-8 lg:p-9 ${
                  p.accent
                    ? "bg-[#101010] text-white"
                    : "border border-[#101010]/8 bg-white"
                }`}
              >
                {p.accent && (
                  <span className="absolute -top-3 left-9 rounded-full bg-[#F9A08B] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#101010]">
                    Выбирают чаще
                  </span>
                )}

                <h3 className={`text-[17px] font-bold ${p.accent ? "text-white" : "text-[#101010]"}`}>{p.name}</h3>
                <p className={`mt-2 text-[13px] leading-[1.5] ${p.accent ? "text-white/45" : "text-[#888]"}`}>{p.for}</p>

                <div className="mt-7 flex items-baseline gap-1.5">
                  <span className={`text-[44px] font-black leading-none tracking-[-0.04em] ${p.accent ? "text-[#F9A08B]" : "text-[#101010]"}`}>
                    {p.price}
                  </span>
                  <span className={`text-[14px] ${p.accent ? "text-white/40" : "text-[#888]"}`}>€ / мес</span>
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F9A08B] text-white">
                        <Check width={10} height={10} />
                      </span>
                      <span className={`text-[13px] leading-[1.5] ${p.accent ? "text-white/75" : "text-[#444]"}`}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate("/register")}
                  className={`mt-9 w-full rounded-xl py-3.5 text-[14px] font-bold transition-transform duration-300 hover:-translate-y-0.5 ${
                    p.accent ? "bg-[#F9A08B] text-[#101010]" : "bg-[#101010] text-white"
                  }`}
                >
                  Попробовать 14 дней
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <p className="mt-6 text-center text-[13px] text-[#888]">
            Пробный период — без карты. В кабинете — вся линия от 2 до 20 сотрудников и безлимит; скидка до <span className="font-bold text-[#101010]">40%</span> при оплате за год.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
