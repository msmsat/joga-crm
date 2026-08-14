import type { ComponentType } from "react";
import { DashboardMockup } from "../../../components/UI";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { JournalScreen, BookingScreen, FinanceScreen, NotifyScreen, AiScreen } from "./Screens";

// id — якорь блока: на него ведут ссылки подвала («Онлайн-запись», «Velora AI»),
// чтобы они попадали в свой разбор, а не наверх страницы.
const BLOCKS: { id: string; title: string; lead: string; points: string[]; Visual: ComponentType }[] = [
  {
    id: "journal",
    title: "Ваш журнал записи",
    lead: "Сетка дня, где тренеры — колонки, а часы — строки. Всё, что делает администратор, делается здесь.",
    points: [
      "Перенос занятия перетаскиванием — на другое время или к другому тренеру",
      "Новое занятие и новый клиент создаются не выходя из журнала",
      "Сводка дня рядом: загрузка залов и выручка",
    ],
    Visual: JournalScreen,
  },
  {
    id: "booking",
    title: "Ваша онлайн-запись",
    lead: "Четыре канала, через которые клиент записывается сам — круглосуточно и без администратора.",
    points: [
      "Веб-виджет, Telegram, WhatsApp и Instagram — каждый настраивается отдельно",
      "Правила: за сколько часов закрывается запись и до какого момента можно отменить",
      "Брендинг мини-приложения с живым превью — цвет и язык под ваш бренд",
    ],
    Visual: BookingScreen,
  },
  {
    id: "finance",
    title: "Ваши финансы",
    lead: "Счета, операции, зарплаты и документы — в одном месте, без выгрузок в таблицы.",
    points: [
      "Касса, расчётный счёт и эквайринг с балансами и движением за день",
      "Абонементы, сертификаты и возвраты привязаны к клиенту и счёту",
      "Зарплаты тренерам считаются по вашим правилам",
    ],
    Visual: FinanceScreen,
  },
  {
    id: "notify",
    title: "Ваши уведомления",
    // Живых каналов ровно три: Telegram, Email, WhatsApp (services/notify.py).
    // Instagram/SMS/Push остались колонками в БД и в рассылке не участвуют —
    // на витрине их быть не должно.
    lead: "Три канала доставки и матрица, где вы сами решаете, что и куда уходит.",
    points: [
      "Telegram, Email и WhatsApp — каждый подключается своим ключом студии",
      "Свой набор событий для клиента, тренера, администратора и владельца",
      "Напоминания за 24 часа и за 2 часа, «осталось 1–2 занятия», день рождения, запрос отзыва",
    ],
    Visual: NotifyScreen,
  },
  {
    id: "ai",
    title: "Ваш AI-слой",
    lead: "Ассистент знает контекст вашего бизнеса и доступен с любой страницы — а агенты отвечают клиентам сами.",
    points: [
      "Вопросы о студии прямо из верхней панели, без перехода в отдельный раздел",
      "AI-агенты в Telegram и Instagram: тон общения и режим «только в нерабочее время»",
      "Статистика: сколько обращений обработано и как их оценили",
    ],
    Visual: AiScreen,
  },
];

function Block({ id, index, title, lead, points, Visual, flip }: {
  id: string; index: number; title: string; lead: string; points: string[];
  Visual: ComponentType; flip: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 border-t border-[#101010]/10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <span className="text-[13px] font-black tabular-nums tracking-[0.1em] text-[#F9A08B]">
          {String(index).padStart(2, "0")}
        </span>
        <h3 className="mt-4 text-[clamp(24px,3vw,34px)] font-black leading-[1.12] tracking-[-0.03em] text-[#101010]">
          {title}
        </h3>
        <p className="mt-4 max-w-[460px] text-[15px] leading-[1.7] text-[#666]">{lead}</p>
        <ul className="mt-7 space-y-3.5">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-[14px] leading-[1.6] text-[#333]">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#F9A08B]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.1} y={36} className={flip ? "lg:order-1" : ""}>
        <Visual />
      </Reveal>
    </div>
  );
}

export function Showcase() {
  return (
    <section id="product" className="scroll-mt-24 bg-[#FDFCFB] py-24 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="всё в одном"
          index={2}
          tone="light"
          title={<>Одна платформа<br />вместо десятка сервисов</>}
          lead="Записи, клиенты, деньги, коммуникация и AI — в одном интерфейсе. Ни одного лишнего модуля: каждый экран решает реальную задачу владельца."
        />

        {/* Параллакса на скролле здесь больше нет: он считал трансформ мокапа
            в главном потоке на каждом кадре прокрутки — ровно поверх самого
            тяжёлого элемента страницы. Ради 50 пикселей сдвига не стоило. */}
        <div className="relative mt-16">
          <div className="lp-glow absolute -inset-8" />
          <div className="relative mx-auto max-w-[900px]">
            <Reveal y={40}>
              <div className="rotate-[-1deg] transition-transform duration-500 hover:rotate-0">
                <DashboardMockup />
              </div>
            </Reveal>
          </div>
        </div>

        <div className="mt-14">
          {BLOCKS.map((b, i) => (
            <Block key={b.id} index={i + 1} flip={i % 2 === 1} {...b} />
          ))}
        </div>
      </div>
    </section>
  );
}
