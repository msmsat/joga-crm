import { useTranslation } from "react-i18next";
import { ACTIVITY_SECTIONS, sectionOfActivity } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const CHECK = (
  <svg width="11" height="9" viewBox="0 0 10 8" fill="none" style={{ flexShrink: 0 }}>
    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function StepActivity({ data, onChange }: Props) {
  const { t } = useTranslation("onboarding");

  // Выбор живёт внутри ОДНОГО раздела: раздел задаёт механику записи, и смешанный
  // набор («йога + барбершоп») настроил бы журнал и онлайн-запись противоречиво.
  // Активный раздел определяется первым отмеченным направлением.
  const active = data.activityTypes.length ? sectionOfActivity(data.activityTypes[0]) : undefined;

  const pick = (ids: string[]) => onChange({ activityTypes: ids });

  const toggle = (id: string) => {
    // Отметка в чужом разделе не запрещена, а ПЕРЕНОСИТ выбор: молча игнорировать
    // клик хуже — человек решил бы, что чип сломан. Последнее отмеченное уходит
    // в конец списка, по нему шаг подбирает сцену-иллюстрацию.
    if (sectionOfActivity(id) !== active) return pick([id]);
    pick(data.activityTypes.includes(id)
      ? data.activityTypes.filter(x => x !== id)
      : [...data.activityTypes, id]);
  };

  const toggleSection = (items: string[], allPicked: boolean) => pick(allPicked ? [] : items);

  const Chip = ({ id, dim }: { id: string; dim: boolean }) => {
    const isSelected = data.activityTypes.includes(id);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        onClick={() => toggle(id)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "10px 16px", fontFamily: "inherit",
          fontSize: "14px", fontWeight: 600, letterSpacing: "-0.2px",
          color: isSelected ? "var(--onyx)" : "var(--text2)",
          background: isSelected ? "rgba(252,174,145,0.10)" : "var(--bg-card)",
          border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
          borderRadius: "12px", cursor: "pointer",
          opacity: dim ? 0.42 : 1,
          transition: "all 0.2s cubic-bezier(0.34,1.1,0.64,1)",
          boxShadow: isSelected ? "0 6px 18px -6px rgba(252,174,145,0.35)" : "none",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = "1";
          if (!isSelected) {
            e.currentTarget.style.borderColor = "rgba(252,174,145,0.5)";
            e.currentTarget.style.background = "rgba(252,174,145,0.04)";
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = dim ? "0.42" : "1";
          if (!isSelected) {
            e.currentTarget.style.borderColor = "#EEEBE6";
            e.currentTarget.style.background = "var(--bg-card)";
          }
        }}
      >
        {t(`onboarding:activity.types.${id}`)}
        {isSelected && <span style={{ color: "#F9A08B", display: "flex" }}>{CHECK}</span>}
      </button>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: "26px" }}>
        <h3 style={{ fontSize: "24px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: "0 0 8px" }}>
          {t("onboarding:activity.title")}
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text3)", margin: 0, lineHeight: "1.6" }}>
          {t("onboarding:activity.subtitle")}
        </p>
      </div>

      {ACTIVITY_SECTIONS.map((section) => {
        const picked = section.items.filter(id => data.activityTypes.includes(id));
        const allPicked = picked.length === section.items.length;
        const dim = !!active && active !== section.id;

        return (
          <div key={section.id} style={{ marginBottom: "26px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px",
              opacity: dim ? 0.42 : 1, transition: "opacity 0.2s ease",
            }}>
              <span style={{ color: picked.length ? "#F9A08B" : "#BBBBBB", display: "flex" }}>{section.icon}</span>
              <span style={{
                fontSize: "12px", fontWeight: 800, letterSpacing: "0.6px",
                textTransform: "uppercase", color: "var(--text3)",
              }}>
                {t(`onboarding:activity.groups.${section.id}`)}
              </span>

              {/* Галочка у заголовка берёт раздел целиком — и заодно переносит
                  сюда выбор, если он был в другом разделе. */}
              <button
                type="button"
                role="checkbox"
                aria-checked={allPicked}
                aria-label={t("onboarding:activity.selectAll")}
                title={t("onboarding:activity.selectAll")}
                onClick={() => toggleSection(section.items, allPicked)}
                style={{
                  width: "20px", height: "20px", borderRadius: "7px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginLeft: "2px", padding: 0, cursor: "pointer",
                  color: "#FFFFFF",
                  background: allPicked ? "#FCAE91" : "transparent",
                  border: allPicked ? "1.5px solid #FCAE91" : "1.5px solid #DDDDDD",
                  transition: "all 0.2s cubic-bezier(0.34,1.1,0.64,1)",
                }}
                onMouseEnter={e => { if (!allPicked) e.currentTarget.style.borderColor = "#FCAE91"; }}
                onMouseLeave={e => { if (!allPicked) e.currentTarget.style.borderColor = "#DDDDDD"; }}
              >
                {allPicked && CHECK}
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {section.items.map(id => <Chip key={id} id={id} dim={dim} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
