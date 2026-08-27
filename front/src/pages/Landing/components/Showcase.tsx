import type { ComponentType, MouseEvent, ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePhone } from "../../../hooks/usePhone";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { PlatformArt } from "./Illustrations";
import { EASE } from "./tokens";
import { JournalScreen, BookingScreen, FinanceScreen, NotifyScreen, AiScreen } from "./Screens";

/**
 * Мокап «следит» за курсором лёгким 3D-наклоном вместо плоского
 * hover:rotate-0 — тот читался как «падает набок», а не как деталь интерфейса.
 * Пружины тянут наклон обратно к базовым -1° при уходе мыши. На телефоне и
 * планшете (нет курсора) наклон остаётся статичным — двигать motion-values
 * там нечему, только даром считать на каждый тач.
 */
function TiltCard({ children }: { children: ReactNode }) {
  const isPhone = usePhone();
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const springX = useSpring(rotX, { stiffness: 220, damping: 22 });
  const springY = useSpring(rotY, { stiffness: 220, damping: 22 });

  if (isPhone) {
    return <div className="rotate-[-1deg]">{children}</div>;
  }

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    rotY.set(((e.clientX - rect.left) / rect.width - 0.5) * 12);
    rotX.set(((e.clientY - rect.top) / rect.height - 0.5) * -12);
  };
  const onMouseLeave = () => {
    rotX.set(0);
    rotY.set(0);
  };

  return (
    <div style={{ perspective: 1400 }}>
      <motion.div
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        whileHover={{ scale: 1.015 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={{ rotateZ: -1, rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// id — якорь блока: на него ведут ссылки подвала («Онлайн-запись», «Velora AI»),
// чтобы они попадали в свой разбор, а не наверх страницы. Тексты живут в
// локали под тем же ключом (`showcase.blocks.<id>`).
const BLOCKS: { id: string; Visual: ComponentType }[] = [
  { id: "journal", Visual: JournalScreen },
  { id: "booking", Visual: BookingScreen },
  { id: "finance", Visual: FinanceScreen },
  { id: "notify", Visual: NotifyScreen },
  { id: "ai", Visual: AiScreen },
];

function Block({ id, index, Visual, flip }: {
  id: string; index: number; Visual: ComponentType; flip: boolean;
}) {
  const { t } = useTranslation("landing");
  const points = t(`showcase.blocks.${id}.points`, { returnObjects: true }) as string[];

  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 border-t border-[#101010]/10 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <span className="text-[13px] font-black tabular-nums tracking-[0.1em] text-[#F9A08B]">
          {String(index).padStart(2, "0")}
        </span>
        <h3 className="mt-4 text-[clamp(24px,3vw,34px)] font-black leading-[1.12] tracking-[-0.03em] text-[#101010]">
          {t(`showcase.blocks.${id}.title`)}
        </h3>
        <p className="mt-4 max-w-[460px] text-[15px] leading-[1.7] text-[#666]">
          {t(`showcase.blocks.${id}.lead`)}
        </p>
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
  const { t } = useTranslation("landing");

  return (
    <section id="product" className="scroll-mt-24 bg-[#FDFCFB] py-24 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label={t("showcase.label")}
          index={2}
          tone="light"
          title={t("showcase.title")}
          lead={t("showcase.lead")}
        />

        {/* Параллакса на скролле здесь больше нет: он считал трансформ мокапа
            в главном потоке на каждом кадре прокрутки — ровно поверх самого
            тяжёлого элемента страницы. Ради 50 пикселей сдвига не стоило. */}
        <div className="relative mt-16">
          <div className="lp-glow absolute -inset-8" />
          <div className="relative mx-auto max-w-[900px]">
            <Reveal y={40}>
              <TiltCard>
                <PlatformArt />
              </TiltCard>
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
