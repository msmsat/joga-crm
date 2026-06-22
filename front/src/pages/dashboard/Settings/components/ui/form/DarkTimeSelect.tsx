import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Toggle from "./Toggle";

function DarkTimeSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      const el = scrollContainerRef.current.querySelector('[data-active="true"]') as HTMLElement;
      if (el) {
        const container = scrollContainerRef.current;
        container.scrollTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      }
    }
  }, [isOpen]);

  const times = Array.from({ length: 25 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  return (
    <div ref={dropdownRef} style={{ position: "relative", userSelect: "none" }}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 12px", borderRadius: "8px",
          border: `1.5px solid ${isOpen ? "var(--peach)" : "var(--border)"}`,
          background: disabled ? "transparent" : "var(--bg-card)",
          color: disabled ? "var(--muted)" : "var(--onyx)",
          fontSize: "12px", fontWeight: 700,
          cursor: disabled ? "default" : "pointer",
          transition: "all 0.2s ease",
          boxShadow: isOpen ? "0 0 0 3px rgba(252,174,145,0.15)" : "none"
        }}
      >
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s ease", opacity: disabled ? 0.4 : 1, color: isOpen ? "var(--peach)" : "inherit" }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      {isOpen && !disabled && (
        <div
          ref={scrollContainerRef}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
            width: "100px", maxHeight: "200px",
            overflowY: "auto",
            scrollbarWidth: "none", msOverflowStyle: "none",
            background: "#111111", border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px", padding: "6px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.2)",
            zIndex: 100,
            animation: "csPopupIn 0.2s cubic-bezier(0.34, 1.3, 0.64, 1) both"
          }}
        >
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>
          {times.map((time) => (
            <div
              key={time}
              data-active={time === value}
              onClick={() => { onChange(time); setIsOpen(false); }}
              style={{
                display: "flex", justifyContent: "center",
                padding: "8px", borderRadius: "8px",
                color: time === value ? "var(--peach)" : "rgba(255, 255, 255, 0.7)",
                fontSize: "12px", fontWeight: time === value ? 800 : 600,
                cursor: "pointer", transition: "all 0.15s ease",
                background: time === value ? "rgba(252, 174, 145, 0.15)" : "transparent"
              }}
              onMouseOver={(e) => {
                if (time !== value) { e.currentTarget.style.background = "rgba(252, 174, 145, 0.08)"; e.currentTarget.style.color = "#FFFFFF"; }
              }}
              onMouseOut={(e) => {
                if (time !== value) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"; }
              }}
            >
              {time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DayHoursRow({ day, from, to, active: initActive }: { day: string; from: string; to: string; active: boolean }) {
  const [active, setActive] = useState(initActive);
  const [fromTime, setFromTime] = useState(from);
  const [toTime, setToTime] = useState(to);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "16px",
      padding: "12px 16px", borderRadius: "10px",
      background: active ? "rgba(252,174,145,0.04)" : "transparent",
      border: active ? "1px solid rgba(252,174,145,0.15)" : "1px solid transparent",
      transition: "all 0.2s ease",
    }}>
      <Toggle checked={active} onChange={() => setActive(!active)} />
      <div style={{
        display: "flex", alignItems: "center", gap: "8px", flex: 1,
        opacity: active ? 1 : 0.35,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity 0.2s ease"
      }}>
        <div style={{ width: "90px", fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{day}</div>
        <DarkTimeSelect value={fromTime} onChange={setFromTime} disabled={!active} />
        <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>
        <DarkTimeSelect value={toTime} onChange={setToTime} disabled={!active} />
      </div>
    </div>
  );
}

export default DarkTimeSelect;
