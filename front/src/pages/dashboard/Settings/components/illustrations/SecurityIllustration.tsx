import { useState, useEffect } from "react";

export default function SecurityIllustration() {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);
  return (
    <div style={{ position: "relative", width: "100%", height: "140px", overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: `translate(-50%, -50%) scale(${animated ? 1 : 0.7})`,
        opacity: animated ? 1 : 0,
        transition: "all 0.6s cubic-bezier(.34,1.4,.64,1)",
        width: "80px", height: "90px",
        background: "linear-gradient(160deg, rgba(252,174,145,0.2), rgba(252,174,145,0.06))",
        borderRadius: "50% 50% 40% 40% / 60% 60% 40% 40%",
        border: "1.5px solid rgba(252,174,145,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 3l8 4v5c0 5-4 9-8 10C8 21 4 17 4 12V7l8-4z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <div key={i} style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: "6px", height: "6px",
          borderRadius: "50%",
          background: i % 2 === 0 ? "rgba(252,174,145,0.6)" : "rgba(163,201,168,0.6)",
          transform: `translate(-50%, -50%) rotate(${deg}deg) translateX(52px)`,
          opacity: animated ? 1 : 0,
          transition: `all 0.4s ease ${0.2 + i * 0.08}s`,
          animation: animated ? `orbit-${i} 6s linear infinite` : "none",
        }} />
      ))}
      {[72, 96].map((size, i) => (
        <div key={i} style={{
          position: "absolute", left: "50%", top: "50%",
          width: `${size}px`, height: `${size}px`,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid rgba(252,174,145,${0.12 - i * 0.04})`,
          opacity: animated ? 1 : 0,
          transition: `opacity 0.4s ease ${0.3 + i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}
