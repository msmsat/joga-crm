import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import {
  Home, Calendar, Users, UserPlus, Building, LinkIcon, CardIcon, Bell,
  Sparkle, ChatBubble, ChartBar, Grid, List, Check, Gear, Clipboard,
} from "../../../components/Icons";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg } from "./Illustrations";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Порядок плиток и иконки — здесь, подписи — в локали (`modules.items.<key>`).
const MODULES: [Icon, string][] = [
  [Home, "dashboard"],
  [Calendar, "journal"],
  [Users, "clients"],
  [UserPlus, "staff"],
  [Building, "catalog"],
  [LinkIcon, "booking"],
  [CardIcon, "finance"],
  [Bell, "notify"],
  [Sparkle, "loyalty"],
  [ChatBubble, "ai"],
  [ChartBar, "reports"],
  [Grid, "miniapp"],
  [List, "multistudio"],
  [Check, "roles"],
  [Gear, "settings"],
  [Clipboard, "data"],
];

// Только то, у чего есть рабочий роутер. 1С и ЮKassa из списка убраны:
// в кабинете это плашка «в разработке», интеграций как таковых нет.
// Имена собственные — не переводятся.
const INTEGRATIONS = ["Telegram", "WhatsApp", "Instagram", "Google Calendar", "Stripe"];

export function Modules() {
  const { t } = useTranslation("landing");

  return (
    <section id="modules" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label={t("modules.label")}
          index={3}
          title={t("modules.title")}
          lead={t("modules.lead")}
        />

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(([Icon, key], i) => (
            <Reveal key={key} delay={(i % 4) * 0.06} className="h-full">
              <article className="group h-full rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors duration-300 hover:border-[#F9A08B] hover:bg-[#F9A08B]">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9A08B]/10 text-[#F9A08B] transition-colors duration-300 group-hover:bg-[#101010]">
                  <Icon width={18} height={18} />
                </div>
                <h3 className="text-[15px] font-bold tracking-[-0.01em] text-white transition-colors duration-300 group-hover:text-[#101010]">
                  {t(`modules.items.${key}.title`)}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-white/40 transition-colors duration-300 group-hover:text-[#101010]/70">
                  {t(`modules.items.${key}.desc`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-7">
            <span className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#F9A08B]">{t("modules.integrations")}</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {INTEGRATIONS.map((n) => (
                <span key={n} className="text-[14px] font-semibold text-white/55">{n}</span>
              ))}
            </div>
            <span className="text-[13px] text-white/30">{t("modules.integrationsNote")}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
