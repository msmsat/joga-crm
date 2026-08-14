import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg, OrbitArt } from "./Illustrations";

export function About() {
  return (
    <section id="about" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="о нас"
          index={6}
          title={<>За Velora стоят люди,<br />которые сами вели студии</>}
          lead="Мы не делаем «CRM для всех». Мы делаем инструмент для конкретной работы: расписание, клиенты, деньги, коммуникация — и отвечаем на вопросы сами, а не отпиской из шаблона."
        />

        <div className="mt-16 grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <div className="mx-auto w-full max-w-[420px]">
              <OrbitArt />
            </div>
          </Reveal>

          {/* Плитки «2021 / 42 человека / 18 стран» убраны: ни одну из этих
              цифр подтвердить нечем, а на странице с ценами придуманная
              статистика стоит дороже, чем добавляет. */}
          <Reveal delay={0.1}>
            <p className="text-[15px] leading-[1.8] text-white/50">
              Клиенты студии остаются клиентами студии. Velora не строит общий каталог,
              не показывает вашим клиентам чужую рекламу и не берёт комиссию за то,
              что человек к вам вернулся.
            </p>
            <p className="mt-6 text-[15px] leading-[1.8] text-white/50">
              Сейчас продукт заточен под студии йоги и пилатеса — под то, как в них
              на самом деле устроены расписание, абонементы и работа тренеров.
              Остальные направления добавятся позже и так же прицельно.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
