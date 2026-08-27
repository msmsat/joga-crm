import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Повторяющийся призыв между главами. Одна и та же формулировка и одна и та же
 * строка-успокоение под кнопкой: на длинной странице повтор работает лучше,
 * чем пять разных обещаний.
 */
export function CtaStrip({ note }: { note?: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");

  return (
    <section className="bg-[#F9A08B]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-14 lg:px-12 lg:py-16">
        <p className="max-w-[520px] text-[clamp(22px,3vw,34px)] font-black leading-[1.1] tracking-[-0.03em] text-[#101010]">
          {t("ctaStrip.title")}
        </p>
        <div>
          <button
            onClick={() => navigate("/register")}
            className="rounded-xl bg-[#101010] px-8 py-4 text-[15px] font-bold text-white transition-transform duration-300 hover:-translate-y-0.5"
          >
            {t("ctaStrip.button")}
          </button>
          <p className="mt-3 text-[12px] font-medium text-[#101010]/60">{note ?? t("ctaStrip.note")}</p>
        </div>
      </div>
    </section>
  );
}
