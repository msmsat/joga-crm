import { useTranslation } from "react-i18next";
import SectionHeader from "../ui/SectionHeader";
import { EXPORT_KINDS, useData } from "../../hooks/useData";

const dataIcons = {
  download: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  loader: <svg className="spin-anim" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" /><path d="M4 12a8 8 0 0 1 8-8" /></svg>,
};

const dateInputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--border)",
  fontSize: "12.5px", fontFamily: "inherit", color: "var(--onyx)", background: "var(--bg-card)",
};

export default function DataTab() {
  const { t } = useTranslation('settings');
  const { dateFrom, setDateFrom, dateTo, setDateTo, estimates, exportingKind, exportKind } = useData();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={dataIcons.download} title={t('data.export.title')} subtitle={t('data.export.subtitle')} accent />

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInputStyle} />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {t('data.export.clearFilter')}
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {EXPORT_KINDS.map((kind) => {
            const estimate = estimates[kind];
            const rows = estimate.data?.rows ?? 0;
            const isEstimating = estimate.isLoading;
            const isExporting = exportingKind === kind;
            const isEmpty = !isEstimating && rows === 0;
            const disabled = isExporting || isEstimating || isEmpty;

            return (
              <div
                key={kind}
                onClick={() => !disabled && exportKind(kind)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderRadius: "12px", border: isExporting ? "1.5px solid var(--peach)" : "1.5px solid rgba(var(--ink),0.06)", background: isExporting ? "rgba(252,174,145,0.02)" : "var(--bg)", cursor: disabled ? "default" : "pointer", opacity: isEmpty ? 0.55 : 1, transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
                onMouseEnter={el => { if (!disabled) { el.currentTarget.style.borderColor = "var(--peach)"; el.currentTarget.style.transform = "translateY(-1px)"; el.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.02)"; } }}
                onMouseLeave={el => { if (!disabled) { el.currentTarget.style.borderColor = "rgba(var(--ink),0.06)"; el.currentTarget.style.transform = "none"; el.currentTarget.style.boxShadow = "none"; } }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{t(`data.export.items.${kind}.name`)}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>
                    {isEstimating ? t('data.export.loading') : isEmpty ? t('data.export.empty') : t('data.export.rows', { count: rows })}
                  </div>
                </div>

                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: isExporting ? "transparent" : "var(--bg-card)", border: "1px solid rgba(var(--ink),0.08)", color: isExporting ? "var(--peach)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s ease" }}>
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
