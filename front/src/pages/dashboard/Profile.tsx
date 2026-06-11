import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────
const icons = {
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  key: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  arrowRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
};

export default function Profile() {
  const navigate = useNavigate();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  
  // Данные для редактирования профиля
  const [userInfo, setUserInfo] = useState({
    name: "Алексей Морозов",
    email: "admin@velora.studio",
    phone: "+7 (999) 123-45-67"
  });
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  
  const [accounts, setAccounts] = useState([
    { id: "1", name: "Алексей Морозов", email: "admin@velora.studio", role: "Владелец (Основной)", active: true, color: "#FCAE91" },
    { id: "2", name: "Alexey Dev", email: "dev.morozov@gmail.com", role: "Тестовый аккаунт", active: false, color: "#9BB5D8" },
    { id: "3", name: "Morozov Personal", email: "alexey@yandex.ru", role: "Личный профиль", active: false, color: "#A3C9A8" },
  ]);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSwitchAccount = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.active) return;
    setIsSwitching(id);
    setTimeout(() => {
      setAccounts(prev => prev.map(a => ({ ...a, active: a.id === id })));
      setIsSwitching(null);
      triggerToast(`Выполнен вход как ${acc.email}`);
    }, 1200);
  };

  const handleLogoutAll = () => {
    triggerToast("Безопасный выход из всех аккаунтов...");
    setTimeout(() => {
      localStorage.removeItem('token');
      navigate('/login');
    }, 1500);
  };

  const handleSaveInfo = () => {
    setIsSavingInfo(true);
    setTimeout(() => {
      setIsSavingInfo(false);
      triggerToast("Личные данные успешно обновлены");
      setAccounts(prev => prev.map(a => a.id === "1" ? { ...a, name: userInfo.name, email: userInfo.email } : a));
    }, 1000);
  };

  const spinnerSvg = (
    <svg className="spin-anim" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );

  return (
    <div style={{ 
      width: "100%", minHeight: "calc(100vh - 80px)", 
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px", boxSizing: "border-box" 
    }}>
      
      {/* ГЛАВНЫЙ КОНТЕЙНЕР (Две колонки) */}
      <div style={{ 
        width: "100%", maxWidth: "980px", 
        display: "flex", flexDirection: "column", gap: "32px",
        animation: "fadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
      }}>
        
        {/* ЗАГОЛОВОК СТРАНИЦЫ (Слева) */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", padding: "12px", borderRadius: "14px", background: "rgba(252,174,145,0.12)", color: "var(--peach)" }}>
            {icons.shield}
          </div>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: "0 0 4px 0" }}>Ваш профиль</h1>
            <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0, fontWeight: 500 }}>Управление личными данными и сессиями</p>
          </div>
        </div>

        {/* СЕТКА (ЛЕВАЯ И ПРАВАЯ ЧАСТИ) */}
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "40px", alignItems: "start" }}>

          {/* ═════════ ЛЕВАЯ КОЛОНКА (Связанные аккаунты + Настройки) ═════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* СПИСОК АККАУНТОВ */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", padding: "0 4px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--onyx)", margin: 0 }}>Связанные аккаунты</h3>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", background: "rgba(0,0,0,0.04)", padding: "3px 10px", borderRadius: "100px" }}>{accounts.length} профиля</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {accounts.map(acc => {
                  const loading = isSwitching === acc.id;
                  
                  return (
                    <div key={acc.id} 
                      className={`acc-card ${acc.active ? "active" : ""}`}
                      onClick={() => handleSwitchAccount(acc.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "16px", borderRadius: "16px",
                        background: acc.active ? "rgba(252,174,145,0.03)" : "#FFFFFF",
                        border: `1.5px solid ${acc.active ? "var(--peach)" : "rgba(26,26,26,0.06)"}`,
                        cursor: acc.active ? "default" : "pointer",
                        boxShadow: acc.active ? "0 8px 24px rgba(252,174,145,0.12)" : "0 2px 6px rgba(0,0,0,0.015)",
                        transform: loading ? "scale(0.98)" : "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "12px",
                          background: `${acc.color}15`, color: acc.color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "14px", fontWeight: 800,
                        }}>
                          {acc.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--onyx)", display: "flex", alignItems: "center", gap: "6px" }}>
                            {acc.name}
                            {acc.active && <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", background: "var(--peach)", color: "white", borderRadius: "50%" }}>{icons.check}</span>}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "1px" }}>{acc.email}</div>
                        </div>
                      </div>

                      {/* Индикатор или Анимированная кнопка */}
                      <div>
                        {loading ? (
                          <div className="spin-anim" style={{ color: "var(--peach)" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          </div>
                        ) : acc.active ? (
                          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--peach)" }}>Активен</span>
                        ) : (
                          // 🔥 АНИМИРОВАННАЯ КНОПКА ВОЙТИ (Появляется при наведении)
                          <div className="acc-action">
                            Войти {icons.arrowRight}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 🔥 НОВАЯ КНОПКА "ДОБАВИТЬ АККАУНТ" */}
                <div 
                  className="add-account-btn"
                  onClick={() => navigate('/register')}
                >
                  <div className="icon-wrapper">{icons.plus}</div>
                  <span style={{ flex: 1 }}>Создать новую учетную запись</span>
                  <div className="add-arrow">{icons.arrowRight}</div>
                </div>
              </div>
            </div>

            {/* НАСТРОЙКИ БЕЗОПАСНОСТИ */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button 
                onClick={() => navigate('/change-password')}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "10px",
                  padding: "16px 20px", borderRadius: "14px",
                  background: "#FFFFFF", border: "1.5px solid rgba(26,26,26,0.06)",
                  color: "var(--onyx)", fontSize: "13px", fontWeight: 700,
                  cursor: "pointer", transition: "all 0.2s", boxShadow: "0 2px 6px rgba(0,0,0,0.015)"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(252,174,145,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(26,26,26,0.06)"; e.currentTarget.style.color = "var(--onyx)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.015)"; }}
              >
                <span style={{ color: "var(--muted)" }}>{icons.key}</span> Сменить пароль
              </button>
              
              <button 
                onClick={handleLogoutAll}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "10px",
                  padding: "16px 20px", borderRadius: "14px",
                  background: "rgba(216,140,154,0.06)", border: "1.5px solid transparent",
                  color: "#C0607A", fontSize: "13px", fontWeight: 700,
                  cursor: "pointer", transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(216,140,154,0.12)"; e.currentTarget.style.borderColor = "rgba(216,140,154,0.2)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(216,140,154,0.06)"; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "none"; }}
              >
                {icons.logout} Завершить все сеансы
              </button>
            </div>
          </div>


          {/* ═════════ ПРАВАЯ КОЛОНКА (Активная сессия + Данные) ═════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* ОСНОВНОЙ АКТИВНЫЙ АККАУНТ (HERO CARD) */}
            <div style={{
              padding: "32px", borderRadius: "24px",
              background: "linear-gradient(135deg, #111111 0%, #1e1e24 100%)",
              color: "white", position: "relative", overflow: "hidden",
              boxShadow: "0 24px 48px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)"
            }}>
              <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "200px", height: "200px", background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
              
              {accounts.filter(a => a.active).map(activeAcc => (
                <div key={activeAcc.id} style={{ display: "flex", alignItems: "center", gap: "24px", position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: "72px", height: "72px", borderRadius: "20px",
                    background: `linear-gradient(135deg, ${activeAcc.color}, #f5887a)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "24px", fontWeight: 800, color: "white",
                    boxShadow: `0 12px 24px ${activeAcc.color}40`, flexShrink: 0
                  }}>
                    {activeAcc.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "inline-block", padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "100px", fontSize: "10px", fontWeight: 800, color: "rgba(255,255,255,0.9)", marginBottom: "10px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      Текущая сессия
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 800, marginBottom: "4px", letterSpacing: "-0.5px" }}>{activeAcc.name}</div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: "8px" }}>
                      {activeAcc.email} <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "rgba(255,255,255,0.3)" }} /> {activeAcc.role}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 🔥 ПРЕМИАЛЬНАЯ ФОРМА ЛИЧНЫХ ДАННЫХ */}
            <div style={{
              padding: "32px", background: "#FFFFFF", 
              border: "1px solid var(--border)", borderRadius: "24px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.02)"
            }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--onyx)", marginBottom: "24px", letterSpacing: "-0.2px" }}>Личные данные</div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                
                <div className="premium-input-group">
                  <label className="float-label">Полное Имя</label>
                  <input 
                    className="premium-input" type="text" value={userInfo.name} 
                    onChange={e => setUserInfo({...userInfo, name: e.target.value})}
                  />
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div className="premium-input-group">
                    <label className="float-label">Email адрес</label>
                    <input 
                      className="premium-input" type="email" value={userInfo.email} 
                      onChange={e => setUserInfo({...userInfo, email: e.target.value})}
                    />
                  </div>
                  <div className="premium-input-group">
                    <label className="float-label">Телефон</label>
                    <input 
                      className="premium-input" type="text" value={userInfo.phone} 
                      onChange={e => setUserInfo({...userInfo, phone: e.target.value})}
                    />
                  </div>
                </div>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                <button 
                  onClick={handleSaveInfo}
                  disabled={isSavingInfo}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "12px 24px", borderRadius: "12px",
                    background: "var(--peach)", border: "none",
                    color: "white", fontSize: "13px", fontWeight: 700,
                    cursor: isSavingInfo ? "default" : "pointer",
                    boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
                    transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)"
                  }}
                  onMouseEnter={e => { if(!isSavingInfo) e.currentTarget.style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { if(!isSavingInfo) e.currentTarget.style.transform = "none" }}
                >
                  {isSavingInfo ? spinnerSvg : "Сохранить изменения"}
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* TOAST НОТИФИКАЦИЯ */}
      <div style={{
        position: "fixed", bottom: "32px", left: "50%",
        transform: toastMsg ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(20px)",
        opacity: toastMsg ? 1 : 0, pointerEvents: toastMsg ? "auto" : "none",
        background: "#111111", color: "#FFFFFF",
        padding: "12px 20px", borderRadius: "12px",
        fontSize: "12px", fontWeight: 700,
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
        transition: "all 0.4s cubic-bezier(0.34, 1.5, 0.64, 1)",
        zIndex: 9999, display: "flex", alignItems: "center", gap: "8px"
      }}>
        <div style={{ color: "var(--peach)" }}>{icons.check}</div>
        {toastMsg}
      </div>

      <style>{`
        /* Анимация появления */
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        /* Спиннер */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spin 1s linear infinite;
          transform-origin: center;
        }

        /* ─── Анимация карточек аккаунтов (Hover Switch) ─── */
        .acc-card {
          transition: all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1);
        }
        .acc-card:not(.active):hover {
          transform: scale(1.02);
          border-color: var(--peach) !important;
          box-shadow: 0 16px 32px rgba(252,174,145,0.15) !important;
        }
        .acc-action {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--peach);
          font-size: 12px;
          font-weight: 800;
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1);
        }
        .acc-card:not(.active):hover .acc-action {
          opacity: 1;
          transform: translateX(0);
        }

        /* ─── Интерактивная кнопка "Добавить аккаунт" ─── */
        .add-account-btn {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(26,26,26,0.02);
          border: 1.5px dashed rgba(26,26,26,0.15);
          color: var(--onyx);
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1);
          margin-top: 6px;
        }
        .add-account-btn:hover {
          background: #FFFFFF;
          border-color: var(--peach);
          border-style: solid;
          color: var(--peach);
          box-shadow: 0 12px 32px rgba(252,174,145,0.15);
          transform: translateY(-2px);
        }
        .add-account-btn .icon-wrapper {
          width: 32px; height: 32px;
          border-radius: 10px;
          background: #FFFFFF;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          transition: all 0.4s cubic-bezier(0.34, 1.5, 0.64, 1);
          color: var(--onyx);
        }
        .add-account-btn:hover .icon-wrapper {
          background: var(--peach);
          color: #FFFFFF;
          transform: rotate(90deg) scale(1.1);
          box-shadow: 0 4px 12px rgba(252,174,145,0.4);
        }
        .add-arrow {
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1);
        }
        .add-account-btn:hover .add-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        /* ─── Премиальные поля ввода (Float Labels) ─── */
        .premium-input-group {
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .float-label {
          position: absolute;
          top: -8px;
          left: 14px;
          background: #FFFFFF;
          padding: 0 6px;
          font-size: 10px;
          font-weight: 800;
          color: var(--peach);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          z-index: 1;
          border-radius: 4px;
        }
        .premium-input {
          width: 100%;
          padding: 16px 18px;
          border-radius: 14px;
          border: 1.5px solid var(--border);
          background: #FDFCFB;
          font-size: 14px;
          font-weight: 600;
          color: var(--onyx);
          outline: none;
          box-sizing: border-box;
          transition: all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.015);
        }
        .premium-input:focus {
          border-color: var(--peach);
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(252,174,145,0.12), inset 0 2px 4px rgba(0,0,0,0.01);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}