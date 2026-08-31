import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { StillCtx, useReducedMotion } from "./kit";
import { Ambient } from "./rig";
import { MeditationScene, PilatesScene, StretchingScene, YogaScene } from "./mat";
import { BodybarScene, CrossfitScene, FitnessScene, MartialScene } from "./gym";
import { DanceScene, MassageScene, SwimmingScene } from "./studio";
import { BeautyScene, IdleScene, OtherScene } from "./care";

// Иллюстрация второго шага онбординга: у каждого направления своя сцена, но
// человечек во всех один и тот же — узнаётся по голове с пучком и по толщине
// костей. Ключи совпадают с id из ACTIVITY_TYPES (components/UI.tsx).
const SCENES: Partial<Record<string, () => ReactElement>> = {
  yoga: YogaScene,
  pilates: PilatesScene,
  stretching: StretchingScene,
  bodybar: BodybarScene,
  fitness: FitnessScene,
  crossfit: CrossfitScene,
  dance: DanceScene,
  martial_arts: MartialScene,
  swimming: SwimmingScene,
  massage_spa: MassageScene,
  beauty: BeautyScene,
  meditation: MeditationScene,
  other: OtherScene,
};

export default function ActivityScene({ activityType }: { activityType: string }) {
  const { t } = useTranslation("onboarding");
  const still = useReducedMotion();
  const Scene = SCENES[activityType];

  return (
    <StillCtx.Provider value={still}>
      <svg
        viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
        style={{ width: "100%", maxHeight: "100%" }}
      >
        <Ambient />
        {/* key — чтобы сцена переигрывалась с начала при смене направления */}
        <g key={activityType || "idle"} style={{ animation: "modalIn 0.45s ease" }}>
          {Scene ? <Scene /> : <IdleScene />}
          <text
            x="150" y="192" textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="inherit"
            fill={Scene ? "#AAAAAA" : "#CCCCCC"}
          >
            {Scene
              ? t(`onboarding:activity.types.${activityType}.label`)
              : t("onboarding:illustration.chooseDirection")}
          </text>
        </g>
      </svg>
    </StillCtx.Provider>
  );
}
