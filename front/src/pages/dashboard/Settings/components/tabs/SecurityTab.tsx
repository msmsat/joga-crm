import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import SecurityIllustration from "../illustrations/SecurityIllustration";
import { useToast } from "../../../../../components/ui/index";
import { useSecurity } from "../../hooks/useSecurity";
import { useGeneralSettings } from "../../hooks/useGeneralSettings";
import { ChangePasswordModal } from "../modals/ChangePasswordModal";
import { DangerZoneModal } from "../modals/DangerZoneModal";
import { OtpConfirmModal } from "../modals/OtpConfirmModal";
import { authApi } from "../../../../../api";
import { fmtLastActive } from "../../../../../lib/format";
import type { ExportArchivePayload } from "../../../../../api/settings/settings.types";

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0] ?? ''}***@${domain}`;
}

type ExportKey = ExportArchivePayload["include"][number];

export default function SecurityTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation('settings');
  const toast = useToast();
  const security = useSecurity();
  const generalQuery = useGeneralSettings();
  const studioName = generalQuery.data?.name ?? '';

  const [exportChecked, setExportChecked] = useState<Record<ExportKey, boolean>>({ clients: true, finances: true, schedule: true });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [twoFaTarget, setTwoFaTarget] = useState<boolean | null>(null); // не null — открыта модалка подтверждения
  const [dangerAction, setDangerAction] = useState<"wipe" | "deleteAccount" | null>(null);

  const { secExpanded, setSecExpanded, sessions } = security;

  const secIcons = {
    laptop: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
    key: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
    archive: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.shield} title={t('security.account.title')} subtitle={t('security.account.subtitle')} accent />
        <SecurityIllustration />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{t('security.twoFa.title')}</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.twoFa.sub')}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <StatusBadge type={security.twoFaEnabled ? "active" : "warning"}>{security.twoFaEnabled ? t('security.twoFa.active') : t('security.twoFa.disabled')}</StatusBadge>
              <Toggle checked={security.twoFaEnabled} onChange={() => setTwoFaTarget(!security.twoFaEnabled)} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{t('security.password.title')}</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.password.sub')}</div>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.1)", color: "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(26,26,26,0.1)"; e.currentTarget.style.color = "var(--onyx)"; e.currentTarget.style.transform = "none"; }}
            >
              {secIcons.key} {t('security.password.change')}
            </button>
          </div>

          <div style={{ borderRadius: "12px", background: secExpanded === "sessions" ? "#FFFFFF" : "rgba(0,0,0,0.015)", border: `1px solid ${secExpanded === "sessions" ? "var(--peach)" : "transparent"}`, transition: "all 0.3s cubic-bezier(0.34,1.5,0.64,1)", overflow: "hidden", boxShadow: secExpanded === "sessions" ? "0 8px 24px rgba(252,174,145,0.12)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{t('security.sessions.title')}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.sessions.sub')}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <StatusBadge type="info">{t('security.sessions.count', { count: sessions.length })}</StatusBadge>
                <button
                  onClick={() => setSecExpanded(secExpanded === "sessions" ? null : "sessions")}
                  style={{ padding: "8px 14px", borderRadius: "8px", background: secExpanded === "sessions" ? "var(--peach)" : "rgba(26,26,26,0.05)", border: "none", color: secExpanded === "sessions" ? "#FFF" : "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                >
                  {secExpanded === "sessions" ? t('security.sessions.hide') : t('security.sessions.manage')}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateRows: secExpanded === "sessions" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s" }}>
              <div style={{ minHeight: 0 }}>
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "16px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {sessions.map(session => {
                      const isMobile = session.platform === "iOS" || session.platform === "Android";
                      return (
                        <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: session.is_current ? "rgba(163,201,168,0.06)" : "#FFF" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div style={{ color: session.is_current ? "#5A9A65" : "var(--muted)" }}>{isMobile ? secIcons.phone : secIcons.laptop}</div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)", display: "flex", alignItems: "center", gap: "6px" }}>
                                {session.device} {session.is_current && <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "#5A9A65", color: "#FFF" }}>{t('security.sessions.current')}</span>}
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                                {session.browser ?? session.platform} · {session.ip_address ?? t('security.sessions.unknownLocation')} · {fmtLastActive(session.last_active)}
                              </div>
                            </div>
                          </div>
                          {!session.is_current && (
                            <button
                              onClick={() => security.terminateSession.mutate(session.id)}
                              disabled={security.terminateSession.isPending}
                              style={{ padding: "6px 12px", borderRadius: "6px", background: "rgba(216,140,154,0.1)", color: "#C0607A", border: "none", fontSize: "11px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.1)"}
                            >
                              {t('security.sessions.terminate')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {sessions.length > 1 && (
                    <button
                      onClick={() => security.terminateOtherSessions.mutate()}
                      disabled={security.terminateOtherSessions.isPending}
                      style={{ marginTop: "10px", background: "none", border: "none", fontSize: "11.5px", fontWeight: 700, color: "#C0607A", cursor: "pointer", padding: 0 }}
                    >
                      {t('security.sessions.terminateAll')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px", border: "1.5px solid rgba(216,140,154,0.3)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: "4px", height: "100%", background: "#D88C9A" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <span style={{ color: "#C0607A" }}>{icons.alertTriangle}</span>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#C0607A" }}>{t('security.danger.title')}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ borderRadius: "12px", background: secExpanded === "export" ? "#FFFFFF" : "rgba(0,0,0,0.015)", border: `1px solid ${secExpanded === "export" ? "var(--peach)" : "transparent"}`, transition: "all 0.3s", overflow: "hidden", boxShadow: secExpanded === "export" ? "0 8px 24px rgba(252,174,145,0.12)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{t('security.danger.export.title')}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.danger.export.sub')}</div>
              </div>
              <button
                onClick={() => setSecExpanded(secExpanded === "export" ? null : "export")}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: secExpanded === "export" ? "var(--peach)" : "#FFFFFF", border: "1px solid", borderColor: secExpanded === "export" ? "var(--peach)" : "rgba(26,26,26,0.1)", color: secExpanded === "export" ? "#FFF" : "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              >
                {secExpanded === "export" ? t('security.danger.export.hide') : <>{secIcons.archive} {t('security.danger.export.prepare')}</>}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateRows: secExpanded === "export" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s" }}>
              <div style={{ minHeight: 0 }}>
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "16px" }} />
                  <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
                    {([
                      ["clients", t('security.danger.export.clients')],
                      ["finances", t('security.danger.export.finances')],
                      ["schedule", t('security.danger.export.schedule')],
                    ] as [ExportKey, string][]).map(([key, label]) => (
                      <label
                        key={key}
                        onClick={() => setExportChecked(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 600, color: "var(--onyx)", cursor: "pointer" }}
                      >
                        <div style={{
                          width: "16px", height: "16px", borderRadius: "5px", flexShrink: 0,
                          border: `1.5px solid ${exportChecked[key] ? "var(--peach)" : "rgba(26,26,26,0.2)"}`,
                          background: exportChecked[key] ? "var(--peach)" : "#FFF",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)",
                          boxShadow: exportChecked[key] ? "0 2px 8px rgba(252,174,145,0.35)" : "none",
                        }}>
                          {exportChecked[key] && (
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2 6 5 9 10 3" />
                            </svg>
                          )}
                        </div>
                        {label}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const include = (Object.keys(exportChecked) as ExportKey[]).filter(k => exportChecked[k]);
                      if (include.length === 0) { toast.error(t('security.danger.export.emptySelection')); return; }
                      security.requestExportArchive.mutate(include);
                    }}
                    disabled={security.requestExportArchive.isPending}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "var(--peach)", color: "#FFF", border: "none", fontSize: "12px", fontWeight: 800, cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 14px rgba(252,174,145,0.35)" }}
                    onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.06)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = "none"; e.currentTarget.style.transform = "none"; }}
                  >
                    {t('security.danger.export.start')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#C0607A" }}>{t('security.danger.wipe.title')}</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.danger.wipe.sub')}</div>
            </div>
            <button
              onClick={() => setDangerAction("wipe")}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "rgba(216,140,154,0.1)", border: "none", color: "#C0607A", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.1)"}
            >
              {t('security.danger.wipe.action')}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(216,140,154,0.05)", border: "1px solid rgba(216,140,154,0.2)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#C0607A" }}>{t('security.danger.deleteAccount.title')}</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>{t('security.danger.deleteAccount.sub')}</div>
            </div>
            <button
              onClick={() => setDangerAction("deleteAccount")}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "#D88C9A", border: "none", color: "#FFF", fontSize: "11.5px", fontWeight: 800, cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 4px 12px rgba(216,140,154,0.4)" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}
            >
              {t('security.danger.deleteAccount.action')}
            </button>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => setShowPasswordModal(false)}
        />
      )}

      {twoFaTarget !== null && (
        <OtpConfirmModal
          action="enable_2fa"
          title={twoFaTarget ? t('security.twoFa.enableTitle') : t('security.twoFa.disableTitle')}
          onClose={() => setTwoFaTarget(null)}
          canContinue
          continueLabel={t('security.otp.sendCode')}
          step1Body={
            <p style={{ fontSize: "13px", color: "var(--text2, #666)", lineHeight: 1.5, margin: 0 }}>
              {twoFaTarget
                ? t('security.twoFa.enableWarning', { email: security.email ? maskEmail(security.email) : '' })
                : t('security.twoFa.disableWarning')}
            </p>
          }
          onConfirmed={async (otpToken) => {
            await security.setTwoFa.mutateAsync({ enabled: twoFaTarget, otpToken });
            setTwoFaTarget(null);
          }}
        />
      )}

      {dangerAction === "wipe" && (
        <DangerZoneModal
          action="delete_data"
          title={t('security.danger.wipe.title')}
          consequences={[
            t('security.danger.wipe.consequence1'),
            t('security.danger.wipe.consequence2'),
            t('security.danger.wipe.consequence3'),
          ]}
          studioName={studioName}
          onClose={() => setDangerAction(null)}
          onConfirmed={async (otpToken, confirmName) => {
            await security.wipeData.mutateAsync({ confirmName, otpToken });
            toast.success(t('security.danger.wipe.toast'));
            setDangerAction(null);
          }}
        />
      )}

      {dangerAction === "deleteAccount" && (
        <DangerZoneModal
          action="delete_account"
          title={t('security.danger.deleteAccount.title')}
          consequences={[
            t('security.danger.deleteAccount.consequence1'),
            t('security.danger.deleteAccount.consequence2'),
            t('security.danger.deleteAccount.consequence3'),
          ]}
          studioName={studioName}
          onClose={() => setDangerAction(null)}
          onConfirmed={async (otpToken, confirmName) => {
            await security.deleteAccount.mutateAsync({ confirmName, otpToken });
            // Кэш набит данными удалённой студии — без сброса /select-crm покажет
            // их же до первого рефетча (EPIC 7, задача 6).
            qc.clear();
            // Токен пока не трогаем: /auth/studios скопан по пользователю, не по
            // studio_id, так что старый (уже без действующей студии) токен всё ещё
            // годится, чтобы узнать, остались ли у пользователя другие студии.
            const studios = await authApi.getStudios();
            if (studios.length === 0) {
              // Удалённая студия была единственной — валидного studio_id для этого
              // пользователя больше нет вообще, вести на /select-crm некуда.
              localStorage.removeItem('token');
              navigate('/register');
            } else {
              navigate('/select-crm');
            }
          }}
        />
      )}
    </div>
  );
}
