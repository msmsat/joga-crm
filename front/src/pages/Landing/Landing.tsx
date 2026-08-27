import { MotionConfig } from "framer-motion";
import { useTranslation } from "react-i18next";
import "../../App.css"; // Manrope + классы кнопок .btn/.btn-primary из ДС
import "./landing.css"; // непрерывные анимации и подложки лендинга
import { LandingNav, LandingFooter } from "./components/Chrome";
import { Hero } from "./components/Hero";
import { Marquee } from "./components/primitives";
import { Stats } from "./components/Stats";
import { Compare } from "./components/Compare";
import { Showcase } from "./components/Showcase";
import { CtaStrip } from "./components/CtaStrip";
import { Modules } from "./components/Modules";
import { Pricing } from "./components/Pricing";
import { Faq } from "./components/Faq";
import { About } from "./components/About";
import { Cta } from "./components/Cta";


/**
 * Лендинг: шесть пронумерованных глав, между ними чередуются чёрные и
 * жемчужные полосы во всю ширину, персиковый — единственный цвет-акцент
 * поверх обоих. Ритм полос намеренно не даёт двум одинаковым фонам встать
 * рядом: BLACK → PEACH → PAPER → BLACK → PAPER → PEACH → BLACK → …
 *
 * Страница живёт вне светлой/тёмной темы кабинета: цвета заданы литералами
 * (см. tokens.ts), потому что маркетинговая обложка всегда одна и та же.
 */
export default function Landing() {
  const { t } = useTranslation("landing");
  // В ленте — то, что в продукте уже есть. Был список ниш (барбершоп, SPA,
  // ногтевой сервис, кроссфит): текущий фокус — студии йоги и пилатеса
  // (docs/TZ/audience.md), остальные вертикали добавятся позже, и обещать их
  // бегущей строкой раньше времени не надо.
  const features = t("marquee", { returnObjects: true }) as string[];

  return (
    // reducedMotion="user" — одной строкой глушит все анимации страницы тем,
    // у кого в системе включено «уменьшить движение».
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-hidden bg-[#101010] font-sans antialiased">
        <LandingNav />
        <main>
          <Hero />
          <Marquee items={features} />
          <Stats />
          <Compare />
          <Showcase />
          <CtaStrip />
          <Modules />
          <Pricing />
          <Faq />
          <About />
          <Cta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
