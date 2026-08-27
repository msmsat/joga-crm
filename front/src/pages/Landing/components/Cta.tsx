import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LEGAL_LINK_PROPS, SUPPORT_WHATSAPP_URL } from "../../../utils/legal";
import { Reveal } from "./primitives";
import { GHOST_ON_DARK } from "./tokens";
import { GridBg } from "./Illustrations";

export function Cta() {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");

  return (
    <section className="relative overflow-hidden bg-[#101010] py-28 lg:py-36">
      <GridBg />
      <div className="lp-glow absolute left-1/2 top-0 h-[420px] w-[min(760px,120%)] -translate-x-1/2 -translate-y-1/3" />

      <Reveal className="relative mx-auto max-w-[860px] px-6 text-center lg:px-12">
        <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#F9A08B]">{t("cta.eyebrow")}</p>
        <h2 className="mt-6 text-[clamp(34px,6vw,68px)] font-black leading-[1.02] tracking-[-0.04em] text-white">
          {t("cta.titleTop")}<br />
          <span className="text-[#F9A08B]">{t("cta.titleAccent")}</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[460px] text-[16px] leading-[1.7] text-white/50">
          {t("cta.lead")}
        </p>
        <div className="mt-11 flex flex-wrap justify-center gap-3">
          <button className="btn btn-primary btn-size-large" onClick={() => navigate("/register")}>
            {t("cta.register")}
          </button>
          <a href={SUPPORT_WHATSAPP_URL} {...LEGAL_LINK_PROPS} className={GHOST_ON_DARK}>
            {t("cta.whatsapp")}
          </a>
        </div>
      </Reveal>
    </section>
  );
}
