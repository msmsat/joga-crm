// Общие детали премиум-модалок каталога (услуга / абонемент / зал):
// левая панель с живым превью, стат-пилюли под ним, заголовки секций формы
// и набор иконок. Стили — в Catalog.css (.cmod-*), хелперы цвета —
// в previewStyle.ts.

export function PreviewPanel({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="cmod-left">
      <div className="cmod-eyebrow">{eyebrow}</div>
      <div className="cmod-glow">{children}</div>
    </div>
  );
}

export function StatPills({ items }: { items: { icon: React.ReactNode; value: React.ReactNode; label: string }[] }) {
  return (
    <div className="cmod-stats">
      {items.map((it, i) => (
        <div key={it.label} className="cmod-pill" style={{ animationDelay: `${80 + i * 50}ms` }}>
          <div className="cmod-pill-v">{it.icon}{it.value}</div>
          <div className="cmod-pill-l">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

export function SectionLabel({ icon, text, delay = 0 }: { icon: React.ReactNode; text: string; delay?: number }) {
  return (
    <div className="cmod-sec cmod-anim" style={{ animationDelay: `${delay}ms` }}>
      {icon}
      {text}
    </div>
  );
}

// Обёртка поля со ступенчатым появлением — форма «собирается» сверху вниз.
export function Field({ delay, children, className }: { delay: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `cmod-anim ${className}` : 'cmod-anim'} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  return (
    <div className="cmod-hint">
      <IconInfo />
      {text}
    </div>
  );
}

// ─── ИКОНКИ ───────────────────────────────────────────────────────────────────
const s = (n: number) => ({ width: n, height: n, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' as const });

export function IconInfo({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
}
export function IconTag({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2.7 12.71a2 2 0 0 1-.58-1.42V4a1 1 0 0 1 1-1h7.29a2 2 0 0 1 1.42.58l8.16 8.17a2 2 0 0 1 0 2.83Z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>;
}
export function IconClock({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
export function IconUsers({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
export function IconUser({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></svg>;
}
export function IconLayers({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>;
}
export function IconPalette({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><circle cx="13.5" cy="6.5" r="1.2" /><circle cx="17.5" cy="10.5" r="1.2" /><circle cx="8.5" cy="7.5" r="1.2" /><circle cx="6.5" cy="12.5" r="1.2" /><path d="M12 2a10 10 0 1 0 0 20c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5-4.5-8.8-10-8.8z" /></svg>;
}
export function IconCalendar({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>;
}
export function IconTicket({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /><path d="M13 5v14" strokeDasharray="2 3" /></svg>;
}
export function IconRuler({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M3 15 15 3l6 6L9 21z" /><path d="M7.5 10.5 9 12" /><path d="M10.5 7.5 12 9" /><path d="M13.5 4.5 15 6" /></svg>;
}
export function IconBox({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>;
}
export function IconMonitor({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>;
}
export function IconPhoto({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
}
export function IconCheck({ size = 12 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
export function IconStore({ size = 13 }: { size?: number }) {
  return <svg {...s(size)} strokeWidth="2"><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-6h6v6" /></svg>;
}
