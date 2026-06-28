import { createPortal } from "react-dom";

interface DeleteDataModalProps {
  type: "deleteData" | "deleteAccount";
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteDataModal({ type, onClose, onConfirm }: DeleteDataModalProps) {
  const isAccount = type === "deleteAccount";

  return createPortal(
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(18, 18, 18, 0.5)",
      zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      animation: "ddmFadeIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both",
      padding: "20px", boxSizing: "border-box",
    }}>
      <style>{`
        @keyframes ddmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ddmScaleUp { from { transform: scale(0.95) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
      `}</style>

      <div style={{
        background: "#1A1A1A", borderRadius: "16px", padding: "32px", width: "420px", maxWidth: "100%",
        boxShadow: "0 20px 50px -12px rgba(216, 140, 154, 0.28), 0 0 0 1px rgba(255,255,255,0.04)",
        border: "1px solid rgba(255, 255, 255, 0.03)",
        animation: "ddmScaleUp 0.3s cubic-bezier(0.34, 1.3, 0.64, 1) both",
        fontFamily: "inherit",
      }}>
        <div style={{
          width: "44px", height: "44px", borderRadius: "12px",
          background: "rgba(216, 140, 154, 0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#D88C9A", marginBottom: "24px",
          boxShadow: "0 0 20px rgba(216, 140, 154, 0.12)",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <div style={{ marginBottom: "32px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FFFFFF", margin: "0 0 10px 0", letterSpacing: "-0.3px", lineHeight: 1.3 }}>
            {isAccount ? "Удалить аккаунт компании" : "Очистить базу данных"}
          </h3>
          <p style={{ fontSize: "13.5px", color: "#999999", margin: 0, fontWeight: 400, lineHeight: 1.6 }}>
            {isAccount
              ? "Это действие полностью и безвозвратно уничтожает бизнес в системе. Восстановить данные или доступ после этого невозможно."
              : "Все клиенты и записи будут удалены без возможности восстановления. Настройки студии и аккаунт сохранятся."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "12px 22px", background: "transparent", color: "#CCCCCC", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: "12px 24px", background: "#D88C9A", color: "#FFFFFF", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(216,140,154,0.35)", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}
          >
            {isAccount ? "Удалить навсегда" : "Стереть данные"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
