import { useState } from "react";

interface InputRowProps {
  label: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  type?: string;
}

export default function InputRow({ label, placeholder, value, defaultValue, onChange, type = "text" }: InputRowProps) {
  const [focused, setFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  const isControlled = value !== undefined;
  const displayValue = isControlled ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    if (onChange) onChange(e.target.value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px" }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding: "10px 14px",
          borderRadius: "10px",
          border: `1.5px solid ${focused ? "var(--peach)" : "var(--border)"}`,
          background: focused ? "rgba(252,174,145,0.04)" : "transparent",
          fontSize: "13px", color: "var(--onyx)",
          outline: "none",
          transition: "all 0.2s ease",
          boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.12)" : "none",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
