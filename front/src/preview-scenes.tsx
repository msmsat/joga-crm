import { createRoot } from "react-dom/client";
import "./App.css";
import { Ambient } from "./components/modals/onboarding/scenes/rig";
import { MeditationScene, PilatesScene, StretchingScene, YogaScene } from "./components/modals/onboarding/scenes/mat";
import { BodybarScene, CrossfitScene, FitnessScene, MartialScene } from "./components/modals/onboarding/scenes/gym";
import { DanceScene, MassageScene, SwimmingScene } from "./components/modals/onboarding/scenes/studio";
import { BeautyScene, IdleScene, OtherScene } from "./components/modals/onboarding/scenes/care";

const LIST = [
  ["yoga", YogaScene], ["pilates", PilatesScene], ["stretching", StretchingScene],
  ["bodybar", BodybarScene], ["fitness", FitnessScene], ["crossfit", CrossfitScene],
  ["dance", DanceScene], ["martial", MartialScene], ["swimming", SwimmingScene],
  ["massage", MassageScene], ["beauty", BeautyScene], ["meditation", MeditationScene],
  ["other", OtherScene], ["idle", IdleScene],
] as const;

createRoot(document.getElementById("root")!).render(
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 380px)", gap: 4, background: "#FDFCFB", fontFamily: "Manrope, sans-serif" }}>
    {LIST.map(([id, Scene]) => (
      <div key={id} style={{ background: "#FFFFFF", padding: "10px 16px 4px", borderRadius: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#F9A08B", letterSpacing: 1 }}>{id}</div>
        <svg viewBox="0 0 300 200" style={{ width: "100%", maxHeight: 190 }} data-scene={id}>
          <Ambient />
          <Scene />
        </svg>
      </div>
    ))}
  </div>,
);
