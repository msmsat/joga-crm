import { useEffect, useRef } from "react";

export const CODE_LENGTH = 6;

interface CodeInputProps {
  code: string[];
  onChange: (next: string[]) => void;
  error?: boolean;
  disabled?: boolean;
  /** Смена значения перекидывает фокус в первую клетку (открыли шаг, сбросили код после ошибки). */
  focusKey?: number;
}

// Клетки под код из письма: автопереход вперёд, backspace — назад, вставка кода
// целиком раскладывается по клеткам. Один компонент на OtpConfirmModal и
// восстановление пароля — раньше эта механика жила только внутри первого.
export function CodeInput({ code, onChange, error, disabled, focusKey = 0 }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const id = setTimeout(() => refs.current[0]?.focus(), 60);
    return () => clearTimeout(id);
  }, [focusKey]);

  const setDigit = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    onChange(next);
    if (digit && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
    if (!digits.length) return;
    e.preventDefault();
    const next = [...code];
    digits.forEach((d, idx) => { next[idx] = d; });
    onChange(next);
    refs.current[Math.min(digits.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const filled = Boolean(code[i]);
        return (
          <input
            key={i}
            ref={el => { refs.current[i] = el; }}
            value={code[i] ?? ""}
            onChange={e => setDigit(i, e.target.value)}
            onKeyDown={e => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={e => e.currentTarget.select()}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            disabled={disabled}
            style={{
              width: "46px", height: "56px", textAlign: "center",
              fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px",
              fontFamily: "Manrope, sans-serif", color: "var(--text, #1A1A1A)",
              borderRadius: "14px", outline: "none", caretColor: "#F9A08B",
              border: `1.5px solid ${error ? "#D88C9A" : filled ? "#FCAE91" : "rgba(var(--ink),0.1)"}`,
              background: filled && !error ? "rgba(252,174,145,0.07)" : "rgba(var(--ink),0.025)",
              boxShadow: error
                ? "0 0 0 3px rgba(216,140,154,0.12)"
                : filled ? "0 4px 14px rgba(252,174,145,0.18)" : "none",
              transform: filled && !error ? "translateY(-1px)" : "none",
              transition: "all 0.18s cubic-bezier(0.34,1.4,0.64,1)",
              opacity: disabled ? 0.6 : 1, boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}
