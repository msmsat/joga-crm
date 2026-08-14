import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";

const QA: [string, string][] = [
  ["Что входит в пробный период?",
   "Полный доступ ко всем модулям на 14 дней. Банковская карта не нужна — если не подойдёт, просто не продлевайте."],
  ["Мои клиенты увидят рекламу других студий?",
   "Нет. Клиент записывается через виджет на вашем сайте, ваш Telegram, WhatsApp или Instagram — и через мини-приложение с вашим цветом и логотипом. Общего каталога с чужими студиями не существует."],
  ["Кто из сотрудников что видит?",
   "Три роли. Владелец — всё. Администратор — журнал, клиентов и дашборд. Тренер — только свои занятия и своих клиентов. Ограничение работает и в интерфейсе, и на сервере: получить чужие данные в обход интерфейса нельзя."],
  ["Можно вести несколько студий или филиалов?",
   "Да, и это не зависит от тарифа. Один аккаунт может состоять в нескольких студиях с переключением между ними, а внутри студии заводятся филиалы и залы."],
  ["Есть тёмная тема и другие языки?",
   "Да, интерфейс переключается между светлой и тёмной темой и говорит по-русски и по-английски. Часовой пояс, валюта и язык задаются при онбординге."],
  ["Что будет с данными, если я решу уйти?",
   "Данные ваши. В настройках есть экспорт в CSV — клиенты, расписание, финансы, абонементы, — а удаление выполняется по вашему запросу."],
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 bg-[#FDFCFB] pb-24 pt-8 lg:pb-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="вопросы"
          index={5}
          tone="light"
          title="Что обычно спрашивают"
        />

        {/* Нативный <details>: раскрытие, доступность и работа без JS —
            бесплатно от браузера, аккордеон писать не нужно. */}
        <div className="mt-14 grid gap-3 lg:grid-cols-2">
          {QA.map(([q, a], i) => (
            <Reveal key={q} delay={(i % 2) * 0.08} className="h-full">
              {/* [&[open]]: — явный arbitrary-вариант вместо open:, который в
                  этой сборке Tailwind для border-цвета не генерируется. */}
              <details className="group h-full rounded-2xl border border-[#101010]/8 bg-white px-7 py-6 transition-colors duration-300 [&[open]]:border-[#F9A08B]/40">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-[15px] font-bold leading-[1.45] text-[#101010] [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9A08B]/12 text-[#F9A08B] transition-transform duration-300 group-open:rotate-45">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-4 text-[14px] leading-[1.7] text-[#666]">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
