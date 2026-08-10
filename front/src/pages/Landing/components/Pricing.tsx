import { useNavigate } from "react-router-dom";
import { Check } from "../../../components/Icons";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";

// Цены и составы тарифов держим в одном месте с разделом «Тариф и оплата»
// (pages/dashboard/Billing/constants.ts + billing.json в locales). В кабинете
// каталог приходит с сервера, здесь витрина статическая — при смене цен или
// валюты правим оба места.
const MODELS = [
  { title: "Подписка", price: "от 990 ₽ / мес", desc: "Фиксированная сумма. Знаете расход заранее — никаких сюрпризов в конце месяца." },
  { title: "3% с выручки", price: "без фикса", desc: "Платите только когда зарабатываете. Подходит студиям с сезонным потоком." },
  { title: "Комбо", price: "½ фикса + 1.5%", desc: "Половина подписки плюс небольшой процент — компромисс между двумя моделями." },
];

const PLANS = [
  {
    id: "start", name: "Старт", price: "990", accent: false,
    for: "Одиночная студия, которая только запускается",
    features: ["До 3 сотрудников", "До 100 клиентов", "Онлайн-запись", "Базовый календарь"],
  },
  {
    id: "pro", name: "Pro", price: "2 490", accent: true,
    for: "Растущая студия с командой и постоянным потоком",
    features: ["До 20 сотрудников", "Неограниченно клиентов", "Полная аналитика", "Лояльность и CRM", "Telegram-уведомления", "Приоритетная поддержка"],
  },
  {
    id: "business", name: "Business", price: "5 990", accent: false,
    for: "Сеть филиалов с собственными процессами",
    features: ["Неограниченно всё", "Мультифилиалы", "White-label", "API-доступ", "Кастомные интеграции", "Выделенный менеджер", "SLA 99.9%", "Обучение команды"],
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
          lead="Три модели оплаты вместо одной навязанной. Переключиться можно в любой момент, а при оплате вперёд действует скидка до 40%."
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
                  <span className={`text-[14px] ${p.accent ? "text-white/40" : "text-[#888]"}`}>₽ / мес</span>
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
            Пробный период — без карты. Скидка до <span className="font-bold text-[#101010]">40%</span> при оплате за 24 месяца.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
