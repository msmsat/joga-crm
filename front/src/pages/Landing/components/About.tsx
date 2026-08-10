import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg, OrbitArt } from "./Illustrations";

const NUMBERS = [
  ["2021", "Год основания"],
  ["42", "Человека в команде"],
  ["18", "Стран"],
];

export function About() {
  return (
    <section id="about" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="о нас"
          index={7}
          title={<>За Velora стоят люди,<br />которые сами вели студии</>}
          lead="Мы не делаем «CRM для всех». Мы делаем инструмент для конкретной работы: расписание, клиенты, деньги, коммуникация — и отвечаем на вопросы сами, а не отпиской из шаблона."
        />

        <div className="mt-16 grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <div className="mx-auto w-full max-w-[420px]">
              <OrbitArt />
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid gap-px overflow-hidden rounded-[24px] bg-white/10 sm:grid-cols-3">
              {NUMBERS.map(([v, l]) => (
                <div key={l} className="bg-[#101010] px-7 py-9">
                  <div className="text-[36px] font-black leading-none tracking-[-0.03em] text-white">{v}</div>
                  <div className="mt-3 text-[12px] text-white/40">{l}</div>
                </div>
              ))}
            </div>

            <p className="mt-8 text-[15px] leading-[1.8] text-white/50">
              Клиенты студии остаются клиентами студии. Velora не строит общий каталог,
              не показывает вашим клиентам чужую рекламу и не берёт комиссию за то,
              что человек к вам вернулся.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
