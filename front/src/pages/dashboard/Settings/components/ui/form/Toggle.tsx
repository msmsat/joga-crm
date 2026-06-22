export default function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange();
      }}
      style={{
        width: "44px", height: "24px",
        background: checked ? "var(--peach)" : "rgba(160, 160, 165, 0.45)",
        borderRadius: "100px",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
        flexShrink: 0,
        outline: "none",
        boxShadow: checked ? "none" : "inset 0 2px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        position: "absolute",
        top: "2px",
        left: checked ? "22px" : "2px",
        width: "20px", height: "20px",
        background: "white",
        borderRadius: "50%",
        transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)",
      }} />
    </button>
  );
}
