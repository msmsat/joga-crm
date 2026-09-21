import { useState } from "react";
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

// Стрелка раздела: повёрнута вниз, пока он закрыт, и вверх — когда открыт.
// Она же единственный признак «сюда можно нажать», который виден до наведения,
// поэтому рисуется всегда, а не по hover.
const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function StepActivity({ data, onChange }: Props) {
  const { t } = useTranslation("onboarding");

  // Выбор живёт внутри ОДНОГО раздела: раздел задаёт механику записи, и смешанный
  // набор («йога + барбершоп») настроил бы журнал и онлайн-запись противоречиво.
  // Активный раздел определяется первым отмеченным направлением.
  const active = data.activityTypes.length ? sectionOfActivity(data.activityTypes[0]) : undefined;

  // Разделы свёрнуты: шесть заголовков вместо тридцати чипов — человек сначала
  // выбирает, ГДЕ он работает, и только потом читает направления. Раскрытых
  // может быть сколько угодно (это не аккордеон: сравнить «Фитнес» и «Красота»,
  // не закрывая первый, — нормальный сценарий).
  // Начальное состояние — раздел, в котором уже есть выбор: возвращаясь на шаг
  // назад, человек должен видеть свои отметки, а не пустые заголовки.
  const [open, setOpen] = useState<string[]>(() => (active ? [active] : []));
  const toggleOpen = (id: string) =>
    setOpen(o => (o.includes(id) ? o.filter(x => x !== id) : [...o, id]));

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
        const isOpen = open.includes(section.id);

        // Раздел из одного направления («Другое») разделом не притворяется:
        // раскрывать заголовок, чтобы увидеть под ним ровно один чип с тем же
        // словом, — два действия там, где хватает одного. Строка сама и есть
        // выбор: та же высота и рамка, что у заголовков, но нажатие отмечает.
        if (section.items.length === 1) {
          const id = section.items[0];
          const isSelected = data.activityTypes.includes(id);
          return (
            <button
              key={section.id}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggle(id)}
              style={{
                width: "100%", marginBottom: "10px",
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 14px", fontFamily: "inherit", textAlign: "left",
                fontSize: "13px", fontWeight: 800, letterSpacing: "-0.2px",
                color: isSelected ? "var(--onyx)" : dim ? "var(--text3)" : "var(--onyx)",
                background: isSelected ? "rgba(252,174,145,0.10)" : "var(--bg-card)",
                border: `1.5px solid ${isSelected ? "#FCAE91" : "#EEEBE6"}`,
                borderRadius: "14px", cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.34,1.1,0.64,1)",
                boxShadow: isSelected ? "0 6px 18px -6px rgba(252,174,145,0.35)" : "none",
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = "rgba(252,174,145,0.5)"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = "#EEEBE6"; }}
            >
              <span style={{ color: isSelected ? "#F9A08B" : "#BBBBBB", display: "flex", flexShrink: 0 }}>
                {section.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(`onboarding:activity.groups.${section.id}`)}
              </span>
              {isSelected && <span style={{ color: "#F9A08B", display: "flex" }}>{CHECK}</span>}
            </button>
          );
        }

        return (
          <div key={section.id} style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Заголовок — кнопка во всю строку: нажимается и по названию, и
                  по иконке, и по пустому месту справа. Рамка и стрелка держат
                  вид кликабельного даже без наведения. */}
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleOpen(section.id)}
                style={{
                  flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px",
                  padding: "12px 14px", fontFamily: "inherit", textAlign: "left",
                  background: isOpen ? "rgba(252,174,145,0.06)" : "var(--bg-card)",
                  border: `1.5px solid ${isOpen ? "rgba(252,174,145,0.45)" : "#EEEBE6"}`,
                  borderRadius: "14px", cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.34,1.1,0.64,1)",
                }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.borderColor = "rgba(252,174,145,0.5)"; }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.borderColor = "#EEEBE6"; }}
              >
                <span style={{ color: picked.length ? "#F9A08B" : "#BBBBBB", display: "flex", flexShrink: 0 }}>
                  {section.icon}
                </span>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: "13px", fontWeight: 800, letterSpacing: "-0.2px",
                  color: dim ? "var(--text3)" : "var(--onyx)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {t(`onboarding:activity.groups.${section.id}`)}
                </span>

                {/* Сколько отмечено внутри — иначе свёрнутый раздел прячет
                    собственный выбор, и его приходится открывать, чтобы
                    вспомнить, что там. */}
                {picked.length > 0 && (
                  <span style={{
                    flexShrink: 0, minWidth: "20px", padding: "2px 7px", borderRadius: "100px",
                    background: "rgba(252,174,145,0.16)", color: "#C2764F",
                    fontSize: "11px", fontWeight: 800, textAlign: "center",
                  }}>
                    {picked.length}
                  </span>
                )}

                <span style={{
                  display: "flex", color: "var(--text3)", flexShrink: 0,
                  transform: isOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.22s cubic-bezier(0.34,1.1,0.64,1)",
                }}>
                  {CHEVRON}
                </span>
              </button>

              {/* «Все» — галочка со словом, и только у раскрытого раздела: у
                  свёрнутого она предлагала бы отметить то, чего не видно.
                  Берёт раздел целиком и заодно переносит сюда выбор, если он
                  был в другом разделе. */}
              {isOpen && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allPicked}
                  title={t("onboarding:activity.selectAll")}
                  onClick={() => toggleSection(section.items, allPicked)}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px", flexShrink: 0,
                    padding: "10px 12px", fontFamily: "inherit",
                    fontSize: "13px", fontWeight: 700, letterSpacing: "-0.2px",
                    color: allPicked ? "#C2764F" : "var(--text2)",
                    background: allPicked ? "rgba(252,174,145,0.12)" : "var(--bg-card)",
                    border: `1.5px solid ${allPicked ? "#FCAE91" : "#EEEBE6"}`,
                    borderRadius: "14px", cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.34,1.1,0.64,1)",
                  }}
                  onMouseEnter={e => { if (!allPicked) e.currentTarget.style.borderColor = "rgba(252,174,145,0.5)"; }}
                  onMouseLeave={e => { if (!allPicked) e.currentTarget.style.borderColor = "#EEEBE6"; }}
                >
                  <span style={{
                    width: "18px", height: "18px", borderRadius: "6px", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#FFFFFF",
                    background: allPicked ? "#FCAE91" : "transparent",
                    border: allPicked ? "1.5px solid #FCAE91" : "1.5px solid #DDDDDD",
                  }}>
                    {allPicked && CHECK}
                  </span>
                  {t("onboarding:activity.all")}
                </button>
              )}
            </div>

            {isOpen && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", padding: "14px 2px 6px" }}>
                {section.items.map(id => <Chip key={id} id={id} dim={dim} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
