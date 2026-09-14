/** Печенье с откусом — знак cookie в баннере и в профиле. */
export function CookieIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M17.5 10.4A7.5 7.5 0 1 1 9.6 2.5a2.6 2.6 0 0 0 3 3 2.6 2.6 0 0 0 3 3 2.6 2.6 0 0 0 1.9 1.9Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
      <circle cx="7" cy="8" r="1.1" fill="currentColor" />
      <circle cx="11.5" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="7" cy="13" r="0.9" fill="currentColor" />
    </svg>
  );
}
