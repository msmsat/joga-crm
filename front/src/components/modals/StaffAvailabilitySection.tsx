import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Switch, useToast } from "../ui/index";
import { Input } from "../ui/modal";
import { staffApi } from "../../api/staff";
import { errorMessage } from "../../api/errorMessage";
import type { StaffBusyInterval } from "../../api/staff/staff.types";

/**
 * HB-18: доступность специалиста для индивидуальной записи.
 *
 * ДВА РАЗНЫХ МЕХАНИЗМА, И ИХ НЕ НАДО ПУТАТЬ. Филиалы — часть карточки, они
 * уходят вместе с ней (`branch_ids` в PUT /staff), и отсутствие поля ≠ пустой
 * список: сервер стирает назначения только по явно присланному списку.
 * Перерывы — отдельное расписание со своим CRUD: их у человека много и на
 * разные даты.
 *
 * КОНФЛИКТ НЕ ПРИМЕНЯЕТСЯ МОЛЧА. Сервер отвечает 409 с перечнем будущих
 * записей — здесь он показывается как есть, и локальное состояние
 * возвращается к серверному: «сохранилось, но не сохранилось» хуже отказа.
 */
type Branch = { id: number; name: string };

function localValue(value: string) {
  // <input type="datetime-local"> и Lesson.start_time говорят на одном языке:
  // МЕСТНОЕ время студии без зоны. Ни Date, ни toISOString здесь не нужны —
  // они приписали бы строке часовой пояс браузера (AC-21).
  return value.length === 16 ? `${value}:00` : value;
}

export default function StaffAvailabilitySection({
  staffId, branches, selected, onSelectedChange, disabled,
}: {
  staffId: number;
  branches: Branch[];
  selected: number[];
  onSelectedChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(["staff", "common"]);
  const toast = useToast();
  const [intervals, setIntervals] = useState<StaffBusyInterval[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    let alive = true;
    staffApi.listBusy(staffId)
      .then(rows => { if (alive) setIntervals(rows); })
      .catch(() => { if (alive) setIntervals([]); });
    return () => { alive = false; };
  }, [staffId]);

  const add = async () => {
    if (!start || !end || busy) return;
    setBusy(true);
    try {
      const row = await staffApi.createBusy(staffId, {
        start_time: localValue(start), end_time: localValue(end), reason: reason.trim() || null,
      });
      setIntervals(prev => [...prev, row].sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setStart(""); setEnd(""); setReason("");
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await staffApi.deleteBusy(staffId, id);
      setIntervals(prev => prev.filter(row => row.id !== id));
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  };

  const toggle = (id: number) => onSelectedChange(
    selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" }}>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "8px" }}>
          {t("staff:availability.branches")}
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
          {t("staff:availability.branchesHint")}
        </div>
        {branches.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>{t("staff:availability.noBranches")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {branches.map(branch => (
              <label key={branch.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ fontSize: "13px", color: "var(--onyx)" }}>{branch.name}</span>
                <Switch checked={selected.includes(branch.id)} disabled={disabled}
                        onChange={() => toggle(branch.id)} />
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "8px" }}>
          {t("staff:availability.breaks")}
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "10px" }}>
          {t("staff:availability.breaksHint")}
        </div>
        {intervals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
            {intervals.map(row => (
              <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", fontSize: "12.5px" }}>
                <span style={{ color: "var(--onyx)" }}>
                  {row.start_time.replace("T", " ").slice(0, 16)} — {row.end_time.replace("T", " ").slice(0, 16)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
                <Button variant="ghost" onClick={() => remove(row.id)}>{t("common:buttons.delete")}</Button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Input label={t("staff:availability.from")} type="datetime-local" value={start} onChange={setStart} />
          <Input label={t("staff:availability.to")} type="datetime-local" value={end} onChange={setEnd} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginTop: "8px" }}>
          <div style={{ flex: 1 }}>
            <Input label={t("staff:availability.reason")} value={reason} onChange={setReason}
                   placeholder={t("staff:availability.reasonPlaceholder")} />
          </div>
          <Button variant="primary" onClick={add} disabled={!start || !end} loading={busy}>
            {t("common:buttons.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
