import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { StillCtx, useReducedMotion } from "./kit";
import { Ambient } from "./rig";
import { MeditationScene, PilatesScene, StretchingScene, YogaScene } from "./mat";
import { BodybarScene, CrossfitScene, FitnessScene, KidsSportScene, MartialScene, PersonalTrainingScene } from "./gym";
import { DanceScene, MassageScene, SwimmingScene } from "./studio";
import { BeautyScene, IdleScene, OtherScene } from "./care";
import {
  BarbershopScene, BrowsLashesScene, CosmetologyScene, HairRemovalScene,
  MakeupScene, NailsScene, TattooScene,
} from "./beauty";
import { ManualTherapyScene, NutritionScene, OsteopathyScene, PhysioScene } from "./recovery";
import { SaunaScene, SpaScene, WrapsScene } from "./relax";

// Иллюстрация второго шага онбординга: у КАЖДОГО направления своя сцена — общих
// не осталось. Человечек во всех один и тот же, узнаётся по голове с пучком и по
// толщине костей; меняется только хореография и инвентарь. Выбор на шаге
// множественный, а сцена одна: показываем последнее отмеченное направление.
// Ключи совпадают с id из ACTIVITY_SECTIONS (components/UI.tsx).
const SCENES: Partial<Record<string, () => ReactElement>> = {
  // Групповые занятия в студии
  yoga: YogaScene,
  pilates: PilatesScene,
  stretching: StretchingScene,
  barre: BodybarScene,
  meditation: MeditationScene,
  // Фитнес и спорт
  gym: FitnessScene,
  crossfit: CrossfitScene,
  martial_arts: MartialScene,
  dance: DanceScene,
  swimming: SwimmingScene,
  kids_sport: KidsSportScene,
  personal_training: PersonalTrainingScene,
  // Красота
  barbershop: BarbershopScene,
  hair_salon: BeautyScene,
  makeup: MakeupScene,
  nails: NailsScene,
  brows_lashes: BrowsLashesScene,
  cosmetology: CosmetologyScene,
  hair_removal: HairRemovalScene,
  tattoo: TattooScene,
  // Массаж и восстановление
  massage: MassageScene,
  manual_therapy: ManualTherapyScene,
  osteopathy: OsteopathyScene,
  physio: PhysioScene,
  nutrition: NutritionScene,
  // SPA и релакс
  spa: SpaScene,
  sauna: SaunaScene,
  wraps: WrapsScene,
  // Своё направление
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
              ? t(`onboarding:activity.types.${activityType}`)
              : t("onboarding:illustration.chooseDirection")}
          </text>
        </g>
      </svg>
    </StillCtx.Provider>
  );
}
