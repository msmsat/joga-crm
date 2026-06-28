import { useState, useRef, useEffect } from 'react';
import styles from '../AI.module.css';

interface Option { value: string; label: string; }

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CustomSelect({ value, options, onChange, placeholder }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 5, left: rect.left, width: rect.width });
    }
    setOpen(v => !v);
  };

  return (
    <div ref={wrapRef} className={styles.customSelectWrap}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`${styles.customSelectBtn} ${open ? styles.customSelectBtnOpen : ''}`}
      >
        <span className={styles.customSelectValue}>{current?.label ?? placeholder ?? value}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className={styles.customSelectDropdown}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {options.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`${styles.customSelectOption} ${o.value === value ? styles.customSelectOptionActive : ''}`}
            >
              {o.label}
              {o.value === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
