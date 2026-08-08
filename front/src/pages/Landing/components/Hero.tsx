import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CATEGORY_ICONS } from "../../../components/UI";
import { EASE, GHOST_ON_DARK } from "./tokens";
import { GridBg, HeroArt } from "./Illustrations";

const WORDS = ["CRM,", "которой", "хочется", "пользоваться"];

export function Hero() {
  const navigate = useNavigate();

  return (
    <section id="top" className="relative flex items-center overflow-hidden bg-[#101010] pb-20 pt-28 lg:min-h-screen lg:pb-24 lg:pt-32">
      <GridBg />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#F9A08B]/10 blur-[120px]" />

      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-14 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-12">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/70"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
            Новый стандарт CRM в 2026
          </motion.span>

          <h1 className="mt-7 text-[clamp(38px,7.2vw,74px)] font-black leading-[1.02] tracking-[-0.035em] text-white">
            {WORDS.map((w, i) => (
              <motion.span
                key={w}
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.09, ease: EASE }}
                className={`mr-[0.26em] inline-block ${i === 1 ? "lg:mr-0 lg:block" : ""}`}
              >
                {i === 2 ? (
                  <span className="relative inline-block text-[#F9A08B]">
                    {w}
                    {/* Персиковый росчерк дорисовывается после появления слова. */}
                    <motion.svg
                      viewBox="0 0 200 14" preserveAspectRatio="none" fill="none" aria-hidden
                      className="absolute -bottom-1 left-0 h-[0.16em] w-full overflow-visible"
                    >
                      <motion.path
                        d="M3 9C52 2 148 2 197 6.5" stroke="#F9A08B" strokeWidth="4" strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.8, delay: 0.95, ease: EASE }}
                      />
                    </motion.svg>
                  </span>
                ) : (
                  w
                )}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
            className="mt-7 max-w-[520px] text-[16px] leading-[1.75] text-white/55 lg:text-[17px]"
          >
            Премиальная B2B CRM для студий, барбершопов и салонов. Записи, клиенты,
            команда и деньги — в одном пространстве. Без лишних кликов, без боли.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.72, ease: EASE }}
            className="mt-10 flex flex-wrap gap-3"
          >
            <button className="btn btn-primary btn-size-large" onClick={() => navigate("/register")}>
              Попробовать 14 дней бесплатно
            </button>
            <a href="#showcase" className={GHOST_ON_DARK}>
              Смотреть демо →
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.95 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <div className="flex">
              {CATEGORY_ICONS.map((Icon, i) => (
                <span
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#101010] bg-gradient-to-br from-[#FCAE91] to-[#F9A08B]"
                  style={{ marginLeft: i > 0 ? "-9px" : 0 }}
                >
                  <Icon width={14} height={14} style={{ color: "#101010" }} />
                </span>
              ))}
            </div>
            <p className="text-[13px] text-white/45">
              <span className="font-bold text-white">2 400+</span> бизнесов уже используют
            </p>
            <span className="flex items-center gap-1.5 rounded-full border border-[#F9A08B]/30 bg-[#F9A08B]/10 px-2.5 py-1">
              <span className="text-[11px] text-[#F9A08B]">★</span>
              <span className="text-[12px] font-bold text-white">4.9</span>
            </span>
          </motion.div>
        </div>

        <div className="mx-auto w-full max-w-[520px]">
          <HeroArt />
        </div>
      </div>
    </section>
  );
}
