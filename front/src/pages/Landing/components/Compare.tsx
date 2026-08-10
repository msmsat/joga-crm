import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg } from "./Illustrations";

const PAIRS: [string, string][] = [
  ["Чтобы записать клиента — уйти из расписания в другой раздел и обратно",
   "Запись и новый клиент — прямо из журнала, не выходя с экрана"],
  ["Отчёты выгружаешь в Excel и сводишь руками",
   "Живые отчёты по тренерам и услугам, экспорт за любой период"],
  ["Уведомления — отдельный сервис за отдельные деньги",
   "6 каналов внутри и матрица «событие × канал» под вашу студию"],
  ["Тренер видит чужое расписание и чужую клиентскую базу",
   "Роли ограничивают доступ и в интерфейсе, и на сервере"],
  ["Ассистент? Максимум — поиск по клиентам",
   "Velora AI отвечает на вопросы о бизнесе и клиентам в Telegram и Instagram"],
];

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
      <path d="m5.5 5.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="7.5" fill="#F9A08B" />
      <path d="m5 8.2 2.2 2.2L11 6.4" stroke="#101010" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Путаный маршрут слева и прямой персиковый справа — метафора в две строки SVG. */
function PathArt({ tangled }: { tangled: boolean }) {
  return (
    <svg viewBox="0 0 220 44" fill="none" className="h-10 w-full" aria-hidden>
      {tangled ? (
        <path
          d="M6 22c14-18 26 14 40-2s24 20 40 4 26-18 40 0 24 16 40 0 26-12 42-6"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="5 5" opacity="0.45"
        />
      ) : (
        <>
          <path d="M6 22h196" stroke="#F9A08B" strokeWidth="2" strokeLinecap="round" />
          <path d="m196 15 8 7-8 7" stroke="#F9A08B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function Compare() {
  return (
    <section id="difference" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="разница"
          index={1}
          title={<>Мы убрали то,<br />что мешало работать</>}
          lead="Velora выросла из собственной боли: мы вели студии и каждый день упирались в CRM, где простая запись клиента стоила девяти кликов. Вот что изменилось."
        />

        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          {/* Как обычно */}
          <Reveal className="h-full">
            <div className="flex h-full flex-col rounded-[24px] border border-white/10 bg-white/[0.02] p-8 text-white/40 lg:p-10">
              <PathArt tangled />
              <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.18em] text-white/35">Как обычно</p>
              <ul className="mt-7 space-y-5">
                {PAIRS.map(([bad]) => (
                  <li key={bad} className="flex gap-3 text-[14px] leading-[1.6]">
                    <Cross />
                    <span>{bad}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* В Velora */}
          <Reveal delay={0.12} className="h-full">
            <div className="flex h-full flex-col rounded-[24px] border border-[#F9A08B]/40 bg-[#F9A08B]/[0.06] p-8 lg:p-10">
              <PathArt tangled={false} />
              <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.18em] text-[#F9A08B]">В Velora</p>
              <ul className="mt-7 space-y-5">
                {PAIRS.map(([, good]) => (
                  <li key={good} className="flex gap-3 text-[14px] leading-[1.6] text-white/85">
                    <Tick />
                    <span>{good}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
