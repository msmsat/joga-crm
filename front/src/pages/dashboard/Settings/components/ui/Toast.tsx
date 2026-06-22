export default function Toast({ message }: { message: string | null }) {
  return (
    <div style={{
      position: "fixed",
      bottom: "32px",
      left: "50%",
      transform: message ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(20px)",
      opacity: message ? 1 : 0,
      pointerEvents: message ? "auto" : "none",
      background: "#111111",
      color: "#FFFFFF",
      padding: "12px 24px",
      borderRadius: "14px",
      fontSize: "13px",
      fontWeight: 700,
      boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2)",
      transition: "all 0.4s cubic-bezier(0.34, 1.5, 0.64, 1)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      gap: "10px"
    }}>
      <div style={{ color: "var(--peach)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      {message}
    </div>
  );
}
