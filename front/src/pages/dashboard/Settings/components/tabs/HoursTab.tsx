import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import PremiumButton from "../ui/PremiumButton";
import { DayHoursRow } from "../ui/form/DarkTimeSelect";

interface HoursTabProps {
  savedStates: Record<string, boolean>;
  triggerSave: (key: string, msg: string) => void;
}

export default function HoursTab({ savedStates, triggerSave }: HoursTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.calendar} title="Рабочие часы" subtitle="Настройте расписание для каждого дня недели" />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
          <DayHoursRow day="Понедельник" from="08:00" to="22:00" active />
          <DayHoursRow day="Вторник" from="08:00" to="22:00" active />
          <DayHoursRow day="Среда" from="08:00" to="22:00" active />
          <DayHoursRow day="Четверг" from="08:00" to="22:00" active />
          <DayHoursRow day="Пятница" from="08:00" to="21:00" active />
          <DayHoursRow day="Суббота" from="09:00" to="20:00" active />
          <DayHoursRow day="Воскресенье" from="10:00" to="18:00" active={false} />
        </div>
        <div style={{
          padding: "12px 16px",
          background: "rgba(252,174,145,0.06)", borderRadius: "10px",
          border: "1px solid rgba(252,174,145,0.2)",
          display: "flex", alignItems: "center", gap: "10px",
          marginBottom: "20px",
        }}>
          <span style={{ color: "var(--peach)" }}>{icons.info}</span>
          <span style={{ fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
            Указанные часы отображаются как официальное время работы студии. Запись клиентов вне этого времени будет доступна.
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PremiumButton
            isSaved={savedStates['hours']}
            onClick={() => triggerSave('hours', 'Расписание обновлено')}
            text="Сохранить расписание"
          />
        </div>
      </div>
    </div>
  );
}
