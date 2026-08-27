import { useTranslation } from "react-i18next";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg, OrbitArt } from "./Illustrations";

export function About() {
  const { t } = useTranslation("landing");

  return (
    <section id="about" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label={t("about.label")}
          index={6}
          title={t("about.title")}
          lead={t("about.lead")}
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
            <p className="text-[15px] leading-[1.8] text-white/50">{t("about.p1")}</p>
            <p className="mt-6 text-[15px] leading-[1.8] text-white/50">{t("about.p2")}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
