import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { EASE } from "./tokens";
import { GridBg, HeroArt } from "./Illustrations";

const WORDS = ["CRM,", "которой", "хочется", "пользоваться"];

export function Hero() {
  const navigate = useNavigate();

  return (
    <section id="top" className="relative flex items-center overflow-hidden bg-[#101010] pb-20 pt-28 lg:min-h-screen lg:pb-24 lg:pt-32">
      <GridBg />
      <div className="lp-glow absolute -right-40 -top-40 h-[560px] w-[560px]" />

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
            Премиальная B2B CRM для студий йоги и пилатеса. Записи, клиенты,
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
          </motion.div>

          {/* Здесь стоял счётчик «2 400+ бизнесов» и рейтинг 4.9 — цифр, которых
              у продукта пока нет. Вместо выдуманной социальной пруфы — условия
              триала, они настоящие (TRIAL_DAYS в routers/auth/onboarding.py). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.95 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"
          >
            {["14 дней бесплатно", "Без банковской карты", "Отмена в один клик"].map((t) => (
              <span key={t} className="flex items-center gap-2 text-[13px] text-white/45">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="6.25" stroke="#F9A08B" strokeWidth="1.2" />
                  <path d="m4.4 7.2 1.9 1.9L9.8 5.6" stroke="#F9A08B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="mx-auto w-full max-w-[520px]">
          <HeroArt />
        </div>
      </div>
    </section>
  );
}
