import { useTranslation } from "react-i18next";
import { Tooltip } from "../ui/index";
import { STAFF_PALETTE } from "../../lib/staffColors";

/**
 * Цвет сотрудника в журнале: им окрашены его колонка и занятия.
 *
 * Выбор только из палитры (lib/staffColors): цвет служит и заливкой, и текстом
 * карточки занятия, и произвольный — бледный или почти чёрный — сделал бы её
 * нечитаемой. Цвета, которые уже носят другие, помечены точкой и подсказкой
 * «у кого»: одинаковые цвета у двух мастеров — ровно то, от чего палитра
 * должна уберечь, но запретом это не делаем — палитра конечна, команда нет.
 */
export default function StaffColorPicker({ value, onChange, taken }: {
  value: string;
  onChange: (color: string) => void;
  /** Остальная команда: кто каким цветом ходит в журнале. */
  taken: { color: string; name: string }[];
}) {
  const { t } = useTranslation("staff");
  const current = value.toUpperCase();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {STAFF_PALETTE.map(color => {
        const selected = color === current;
        const owners = taken.filter(p => p.color.toUpperCase() === color).map(p => p.name);
        const swatch = (
          <button
            type="button"
            onClick={() => onChange(color)}
            aria-pressed={selected}
            aria-label={owners.length ? t("editModal.profile.colorTakenBy", { names: owners.join(", ") }) : color}
            style={{
              width: "28px", height: "28px", borderRadius: "50%", padding: 0,
              background: color, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              // Кольцо выбора отделено от кружка цветом фона — видно и на
              // светлой, и на тёмной теме.
              boxShadow: selected ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}` : "none",
              transform: selected ? "scale(1.05)" : "none",
              transition: "box-shadow 0.15s ease, transform 0.15s ease",
            }}
          >
            {selected ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : owners.length > 0 && (
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "white", opacity: 0.9 }} />
            )}
          </button>
        );
        return owners.length > 0
          ? <Tooltip key={color} label={t("editModal.profile.colorTakenBy", { names: owners.join(", ") })}>{swatch}</Tooltip>
          : <span key={color} style={{ display: "inline-flex" }}>{swatch}</span>;
      })}
    </div>
  );
}
