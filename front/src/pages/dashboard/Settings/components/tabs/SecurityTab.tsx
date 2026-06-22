import { useNavigate } from "react-router-dom";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import InputRow from "../ui/form/InputRow";
import SecurityIllustration from "../illustrations/SecurityIllustration";
import type { Session, ApiToken } from "../../types";

interface SecurityTabProps {
  secExpanded: "sessions" | "token" | "export" | null;
  setSecExpanded: (v: "sessions" | "token" | "export" | null) => void;
  setSecModal: (v: "password" | "deleteData" | "deleteAccount" | null) => void;
  activeSessions: Session[];
  apiTokens: ApiToken[];
  newTokenName: string;
  setNewTokenName: (v: string) => void;
  terminateSession: (id: number) => void;
  revokeToken: (id: number) => void;
  generateToken: () => void;
  twoFa: boolean;
  setTwoFa: (v: boolean) => void;
  triggerToast: (msg: string) => void;
}

export default function SecurityTab({
  secExpanded, setSecExpanded, setSecModal,
  activeSessions, apiTokens, newTokenName, setNewTokenName,
  terminateSession, revokeToken, generateToken,
  twoFa, setTwoFa, triggerToast,
}: SecurityTabProps) {
  const navigate = useNavigate();

  const secIcons = {
    laptop: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
    key: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
    archive: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.shield} title="Безопасность аккаунта" subtitle="Защитите доступ к вашему рабочему пространству" accent />
        <SecurityIllustration />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Двухфакторная аутентификация</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>SMS или приложение-аутентификатор</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <StatusBadge type={twoFa ? "active" : "warning"}>{twoFa ? "Активна" : "Отключена"}</StatusBadge>
              <Toggle checked={twoFa} onChange={() => setTwoFa(!twoFa)} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Пароль администратора</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Последнее изменение: 3 месяца назад</div>
            </div>
            <button
              onClick={() => navigate("/change-password")}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.1)", color: "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(26,26,26,0.1)"; e.currentTarget.style.color = "var(--onyx)"; e.currentTarget.style.transform = "none"; }}
            >
              {secIcons.key} Сменить пароль
            </button>
          </div>

          <div style={{ borderRadius: "12px", background: secExpanded === "sessions" ? "#FFFFFF" : "rgba(0,0,0,0.015)", border: `1px solid ${secExpanded === "sessions" ? "var(--peach)" : "transparent"}`, transition: "all 0.3s cubic-bezier(0.34,1.5,0.64,1)", overflow: "hidden", boxShadow: secExpanded === "sessions" ? "0 8px 24px rgba(252,174,145,0.12)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Активные сессии</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Где сейчас выполнен вход в аккаунт</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <StatusBadge type="info">{activeSessions.length} устройства</StatusBadge>
                <button
                  onClick={() => setSecExpanded(secExpanded === "sessions" ? null : "sessions")}
                  style={{ padding: "8px 14px", borderRadius: "8px", background: secExpanded === "sessions" ? "var(--peach)" : "rgba(26,26,26,0.05)", border: "none", color: secExpanded === "sessions" ? "#FFF" : "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                >
                  {secExpanded === "sessions" ? "Скрыть" : "Управление"}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateRows: secExpanded === "sessions" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s" }}>
              <div style={{ minHeight: 0 }}>
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "16px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {activeSessions.map(session => (
                      <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: session.current ? "rgba(163,201,168,0.06)" : "#FFF" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                          <div style={{ color: session.current ? "#5A9A65" : "var(--muted)" }}>{session.icon === "laptop" ? secIcons.laptop : secIcons.phone}</div>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)", display: "flex", alignItems: "center", gap: "6px" }}>
                              {session.device} {session.current && <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "#5A9A65", color: "#FFF" }}>Текущая</span>}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>{session.browser} · {session.loc} · {session.time}</div>
                          </div>
                        </div>
                        {!session.current && (
                          <button
                            onClick={() => terminateSession(session.id)}
                            style={{ padding: "6px 12px", borderRadius: "6px", background: "rgba(216,140,154,0.1)", color: "#C0607A", border: "none", fontSize: "11px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.1)"}
                          >
                            Завершить
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.link} title="API токены" subtitle="Ключи для интеграции внешних сервисов" />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {apiTokens.map((token) => (
            <div key={token.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "10px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--onyx)" }}>{token.name}</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", fontFamily: "monospace", marginTop: "2px" }}>{token.key}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{token.created}</div>
              <button
                onClick={() => revokeToken(token.id)}
                style={{ display: "flex", alignItems: "center", gap: "4px", color: "#C0607A", background: "rgba(216,140,154,0.1)", border: "none", borderRadius: "6px", padding: "6px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.1)"}
              >
                {icons.trash} Отозвать
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: "12px", background: secExpanded === "token" ? "rgba(252,174,145,0.04)" : "transparent", transition: "all 0.3s", overflow: "hidden" }}>
          {!secExpanded || secExpanded !== "token" ? (
            <button
              onClick={() => setSecExpanded("token")}
              style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 16px", borderRadius: "10px", background: "rgba(252,174,145,0.1)", border: "1px dashed rgba(252,174,145,0.4)", color: "var(--peach)", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(252,174,145,0.15)"; e.currentTarget.style.borderStyle = "solid"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(252,174,145,0.1)"; e.currentTarget.style.borderStyle = "dashed"; }}
            >
              {icons.plus} Создать новый токен
            </button>
          ) : (
            <div style={{ padding: "16px", border: "1px solid var(--peach)", borderRadius: "12px", display: "flex", alignItems: "flex-end", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <InputRow label="Название интеграции" placeholder="Например: AmoCRM Синхронизация" value={newTokenName} onChange={setNewTokenName} />
              </div>
              <button onClick={() => setSecExpanded(null)} className="topbar-ghost" style={{ padding: "10px 16px", fontSize: "12px" }}>Отмена</button>
              <button
                onClick={generateToken}
                style={{ padding: "10px 20px", borderRadius: "10px", background: "var(--peach)", border: "none", color: "#FFF", fontSize: "12px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(252,174,145,0.3)" }}
              >
                Сгенерировать ключ
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: "28px", border: "1.5px solid rgba(216,140,154,0.3)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: "4px", height: "100%", background: "#D88C9A" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <span style={{ color: "#C0607A" }}>{icons.alertTriangle}</span>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#C0607A" }}>Управление данными (Опасная зона)</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ borderRadius: "12px", background: secExpanded === "export" ? "#FFFFFF" : "rgba(0,0,0,0.015)", border: `1px solid ${secExpanded === "export" ? "var(--peach)" : "transparent"}`, transition: "all 0.3s", overflow: "hidden", boxShadow: secExpanded === "export" ? "0 8px 24px rgba(252,174,145,0.12)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>Экспорт всех данных</div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Скачать архив с клиентской базой и историей</div>
              </div>
              <button
                onClick={() => setSecExpanded(secExpanded === "export" ? null : "export")}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: secExpanded === "export" ? "var(--peach)" : "#FFFFFF", border: "1px solid", borderColor: secExpanded === "export" ? "var(--peach)" : "rgba(26,26,26,0.1)", color: secExpanded === "export" ? "#FFF" : "var(--onyx)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              >
                {secExpanded === "export" ? "Скрыть" : <>{secIcons.archive} Подготовить архив</>}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateRows: secExpanded === "export" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s" }}>
              <div style={{ minHeight: 0 }}>
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "16px" }} />
                  <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 600, color: "var(--onyx)", cursor: "pointer" }}><input type="checkbox" defaultChecked /> База клиентов (CSV)</label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 600, color: "var(--onyx)", cursor: "pointer" }}><input type="checkbox" defaultChecked /> Финансовые транзакции</label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: 600, color: "var(--onyx)", cursor: "pointer" }}><input type="checkbox" defaultChecked /> Медиа и фото</label>
                  </div>
                  <button
                    onClick={() => { triggerToast("Формирование ZIP архива началось. Мы пришлем ссылку на Email."); setSecExpanded(null); }}
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(252,174,145,0.15)", color: "var(--peach)", border: "none", fontSize: "12px", fontWeight: 800, cursor: "pointer", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(252,174,145,0.25)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(252,174,145,0.15)"}
                  >
                    Начать выгрузку
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(0,0,0,0.015)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#C0607A" }}>Очистить базу данных</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Удаляет всех клиентов и записи. Настройки сохранятся.</div>
            </div>
            <button
              onClick={() => setSecModal("deleteData")}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "rgba(216,140,154,0.1)", border: "none", color: "#C0607A", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.1)"}
            >
              Стереть данные
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "12px", background: "rgba(216,140,154,0.05)", border: "1px solid rgba(216,140,154,0.2)" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#C0607A" }}>Удалить аккаунт компании</div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>Полное и безвозвратное уничтожение бизнеса в системе</div>
            </div>
            <button
              onClick={() => setSecModal("deleteAccount")}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "#D88C9A", border: "none", color: "#FFF", fontSize: "11.5px", fontWeight: 800, cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", boxShadow: "0 4px 12px rgba(216,140,154,0.4)" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}
            >
              Удалить навсегда
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
