import { useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import DarkSelectRow from "../ui/form/DarkSelectRow";

interface DataTabProps {
  triggerToast: (msg: string) => void;
}

const dataIcons = {
  database: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  download: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  loader: <svg className="spin-anim" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" /><path d="M4 12a8 8 0 0 1 8-8" /></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
};

export default function DataTab({ triggerToast }: DataTabProps) {
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupRetention, setBackupRetention] = useState("30 дней");
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [exportingItem, setExportingItem] = useState<number | null>(null);

  const handleCreateBackupNow = () => {
    setIsCreatingBackup(true);
    setTimeout(() => {
      setIsCreatingBackup(false);
      triggerToast("Резервная копия базы данных успешно создана ✨");
    }, 2000);
  };

  const handleDownloadBackupFile = () => {
    setIsDownloadingBackup(true);
    setTimeout(() => {
      setIsDownloadingBackup(false);
      triggerToast("Файл backup_joga_live.sql скачан");
    }, 1500);
  };

  const handleTriggerExport = (id: number, name: string) => {
    setExportingItem(id);
    setTimeout(() => {
      setExportingItem(null);
      triggerToast(`Документ "${name}" успешно экспортирован`);
    }, 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={dataIcons.database} title="Хранилище данных" subtitle="Мониторинг дискового пространства и автоматизация бэкапов" accent />

        <div style={{ marginBottom: "24px", background: "rgba(0,0,0,0.01)", padding: "18px 20px", borderRadius: "14px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Использовано дискового пространства</span>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--onyx)", fontFamily: "monospace" }}>2.4 ГБ / 10 ГБ</span>
          </div>

          <div style={{ height: "8px", borderRadius: "100px", background: "rgba(26,26,26,0.06)", overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}>
            <div style={{ height: "100%", width: "24%", background: "linear-gradient(90deg, var(--peach) 0%, #f07050 100%)", borderRadius: "100px", boxShadow: "0 2px 8px rgba(252,174,145,0.4)" }} />
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
            {[
              { label: "Клиенты", size: "0.8 ГБ", color: "var(--peach)" },
              { label: "Медиа-файлы", size: "1.4 ГБ", color: "#9BB5D8" },
              { label: "Документы", size: "0.2 ГБ", color: "#A3C9A8" },
            ].map((d, i) => (
              <div
                key={i}
                onClick={() => triggerToast(`Детализация категории: ${d.label} (${d.size})`)}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "8px", background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.04)", cursor: "pointer", transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)", boxShadow: "0 2px 4px rgba(0,0,0,0.01)" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.borderColor = "rgba(252,174,145,0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "rgba(26,26,26,0.04)"; }}
              >
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: "11.5px", color: "var(--muted)", fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--onyx)", fontFamily: "monospace" }}>{d.size}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px", background: autoBackup ? "rgba(252,174,145,0.03)" : "transparent", transition: "background 0.2s" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Автоматическое резервное копирование</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Ежедневное создание слепка системы в 03:00 ночи</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <StatusBadge type={autoBackup ? "active" : "warning"}>{autoBackup ? "Включён" : "Отключён"}</StatusBadge>
              <Toggle checked={autoBackup} onChange={() => setAutoBackup(!autoBackup)} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Последняя успешная копия</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Сегодня в 03:14 · Объём сжатого архива: 124 МБ</div>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px" }}>
              {dataIcons.clock} 10 часов назад
            </span>
          </div>

          <DarkSelectRow
            label="Срок хранения архивных бэкапов"
            value={backupRetention}
            options={["14 дней", "30 дней", "60 дней", "90 дней"]}
            onChange={setBackupRetention}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button
            onClick={handleDownloadBackupFile}
            disabled={isDownloadingBackup}
            style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "10px", background: "rgba(252,174,145,0.08)", border: "1px solid rgba(252,174,145,0.2)", color: "var(--peach)", fontSize: "12px", fontWeight: 700, cursor: isDownloadingBackup ? "default" : "pointer", transition: "all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)" }}
            onMouseEnter={e => { if (!isDownloadingBackup) { e.currentTarget.style.background = "var(--peach)"; e.currentTarget.style.color = "white"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!isDownloadingBackup) { e.currentTarget.style.background = "rgba(252,174,145,0.08)"; e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.transform = "none"; } }}
          >
            {isDownloadingBackup ? dataIcons.loader : dataIcons.download}
            {isDownloadingBackup ? "Скачивание..." : "Скачать последний бэкап"}
          </button>

          <button
            onClick={handleCreateBackupNow}
            disabled={isCreatingBackup}
            style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "10px", border: "1px solid rgba(26,26,26,0.1)", background: isCreatingBackup ? "rgba(163,201,168,0.12)" : "#FFFFFF", borderColor: isCreatingBackup ? "rgba(163,201,168,0.3)" : "rgba(26,26,26,0.1)", color: isCreatingBackup ? "#5A9A65" : "var(--onyx)", fontSize: "12px", fontWeight: 700, cursor: isCreatingBackup ? "default" : "pointer", transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}
            onMouseEnter={e => { if (!isCreatingBackup) { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!isCreatingBackup) { e.currentTarget.style.borderColor = "rgba(26,26,26,0.1)"; e.currentTarget.style.color = "var(--onyx)"; e.currentTarget.style.transform = "none"; } }}
          >
            {isCreatingBackup
              ? dataIcons.loader
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            }
            {isCreatingBackup ? "Компиляция таблиц..." : "Сгенерировать бэкап сейчас"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={dataIcons.download} title="Экспорт отчётов и списков" subtitle="Выгрузите файлы в табличных форматах для бухгалтерии и аналитики" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {[
            { id: 1, name: "Полный список клиентов", format: "CSV / XLSX (Excel)", size: "4.2 МБ" },
            { id: 2, name: "История журналов и записей", format: "CSV / PDF Документ", size: "12.8 МБ" },
            { id: 3, name: "Финансовый отчёт и касса", format: "XLSX / Сводная таблица", size: "1.1 МБ" },
            { id: 4, name: "Сводная AI-аналитика студии", format: "PDF Презентация", size: "8.4 МБ" },
          ].map((e) => {
            const isExporting = exportingItem === e.id;
            return (
              <div
                key={e.id}
                onClick={() => !isExporting && handleTriggerExport(e.id, e.name)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderRadius: "12px", border: isExporting ? "1.5px solid var(--peach)" : "1.5px solid rgba(26,26,26,0.06)", background: isExporting ? "rgba(252,174,145,0.02)" : "#FDFCFB", cursor: isExporting ? "default" : "pointer", transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
                onMouseEnter={el => { if (!isExporting) { el.currentTarget.style.borderColor = "var(--peach)"; el.currentTarget.style.transform = "translateY(-1px)"; el.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.02)"; } }}
                onMouseLeave={el => { if (!isExporting) { el.currentTarget.style.borderColor = "rgba(26,26,26,0.06)"; el.currentTarget.style.transform = "none"; el.currentTarget.style.boxShadow = "none"; } }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{e.name}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>{e.format} · <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{e.size}</span></div>
                </div>

                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: isExporting ? "transparent" : "#FFFFFF", border: "1px solid rgba(26,26,26,0.08)", color: isExporting ? "var(--peach)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" }}>
                  {isExporting ? dataIcons.loader : dataIcons.download}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
