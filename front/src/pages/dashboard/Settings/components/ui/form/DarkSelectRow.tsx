import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface DarkSelectRowProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

export default function DarkSelectRow({ label, value, options, onChange }: DarkSelectRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        portalRef.current && !portalRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: "10px",
        background: hovered || isOpen ? "rgba(252,174,145,0.05)" : "transparent",
        transition: "background 0.2s ease",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{label}</div>

      <div ref={triggerRef} style={{ position: "relative", width: "180px", userSelect: "none" }}>
        <div
          onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px",
            background: "#FFFFFF",
            border: `1.5px solid ${isOpen ? "var(--peach)" : "rgba(26, 26, 26, 0.09)"}`,
            borderRadius: "10px",
            color: "#1A1A1A",
            fontSize: "12px", fontWeight: 700, cursor: "pointer",
            boxShadow: isOpen ? "0 0 0 3px rgba(252, 174, 145, 0.25)" : "0 2px 6px rgba(0, 0, 0, 0.03)",
            transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s ease", color: isOpen ? "var(--peach)" : "rgba(26,26,26,0.4)", flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>

        {isOpen && createPortal(
          <div
            ref={portalRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              background: "#111111", border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px", padding: "6px",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.2)",
              zIndex: 999999,
              animation: "csPopupIn 0.2s cubic-bezier(0.34, 1.3, 0.64, 1) both",
            }}
          >
            {options.map((opt) => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: "9px",
                  color: opt === value ? "var(--peach)" : "rgba(255, 255, 255, 0.7)",
                  fontSize: "12px", fontWeight: opt === value ? 700 : 600,
                  cursor: "pointer", transition: "all 0.15s ease",
                  background: opt === value ? "rgba(252, 174, 145, 0.15)" : "transparent",
                }}
                onMouseOver={(e) => {
                  if (opt !== value) { e.currentTarget.style.background = "rgba(252, 174, 145, 0.08)"; e.currentTarget.style.color = "#FFFFFF"; }
                }}
                onMouseOut={(e) => {
                  if (opt !== value) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"; }
                }}
              >
                <span>{opt}</span>
                {opt === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: "csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1) both" }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
