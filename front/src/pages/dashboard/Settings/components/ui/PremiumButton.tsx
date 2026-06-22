import { useState } from "react";

interface PremiumButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isSaved: boolean;
  text: string;
  savedText?: string;
  style?: React.CSSProperties;
}

export default function PremiumButton({ onClick, disabled, isSaved, text, savedText = "Сохранено", style }: PremiumButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = isSaved ? "rgba(252,174,145,0.12)" : "var(--peach)";
  const border = isSaved ? "1.5px solid rgba(252,174,145,0.3)" : "1.5px solid transparent";
  const textColor = isSaved ? "var(--peach)" : "white";

  const shadow = isSaved
    ? "none"
    : pressed
    ? "0 2px 8px rgba(252,174,145,0.3)"
    : hovered
    ? "0 8px 24px rgba(252,174,145,0.45)"
    : "0 4px 16px rgba(252,174,145,0.35)";

  const transform = isSaved
    ? "scale(0.98)"
    : pressed
    ? "scale(0.96) translateY(0)"
    : hovered
    ? "scale(1) translateY(-2px)"
    : "scale(1) translateY(0)";

  return (
    <button
      onClick={onClick}
      disabled={disabled || isSaved}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: "flex", alignItems: "center", gap: "7px", justifyContent: "center",
        padding: "9px 22px", borderRadius: "10px",
        background: bg,
        border: border,
        color: textColor,
        fontSize: "13px", fontWeight: 700,
        cursor: (disabled || isSaved) ? "default" : "pointer",
        transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
        transform: transform,
        boxShadow: shadow,
        ...style
      }}
    >
      {isSaved ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "csCheckPop 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {savedText}
        </div>
      ) : text}
    </button>
  );
}
