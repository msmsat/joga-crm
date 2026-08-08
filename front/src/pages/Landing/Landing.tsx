import { MotionConfig } from "framer-motion";
import "../../App.css"; // Manrope + классы кнопок .btn/.btn-primary из ДС
import { LandingNav, LandingFooter } from "./components/Chrome";
import { Hero } from "./components/Hero";
import { Marquee } from "./components/primitives";
import { Stats } from "./components/Stats";
import { Compare } from "./components/Compare";
import { Showcase } from "./components/Showcase";
import { CtaStrip } from "./components/CtaStrip";
import { Modules } from "./components/Modules";
import { Pricing } from "./components/Pricing";
import { Testimonials } from "./components/Testimonials";
import { Faq } from "./components/Faq";
import { About } from "./components/About";
import { Cta } from "./components/Cta";

const NICHES = [
  "Йога", "Пилатес", "Барбершоп", "Фитнес", "SPA", "Стретчинг",
  "Массаж", "Танцы", "Ногтевой сервис", "Кроссфит",
];

/**
 * Лендинг: семь пронумерованных глав, между ними чередуются чёрные и
 * жемчужные полосы во всю ширину, персиковый — единственный цвет-акцент
 * поверх обоих. Ритм полос намеренно не даёт двум одинаковым фонам встать
 * рядом: BLACK → PEACH → PAPER → BLACK → PAPER → PEACH → BLACK → …
 *
 * Страница живёт вне светлой/тёмной темы кабинета: цвета заданы литералами
 * (см. tokens.ts), потому что маркетинговая обложка всегда одна и та же.
 */
export default function Landing() {
  return (
    // reducedMotion="user" — одной строкой глушит все анимации страницы тем,
    // у кого в системе включено «уменьшить движение».
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-hidden bg-[#101010] font-sans antialiased">
        <LandingNav />
        <main>
          <Hero />
          <Marquee items={NICHES} />
          <Stats />
          <Compare />
          <Showcase />
          <CtaStrip />
          <Modules />
          <Pricing />
          <Testimonials />
          <Faq />
          <About />
          <Cta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
