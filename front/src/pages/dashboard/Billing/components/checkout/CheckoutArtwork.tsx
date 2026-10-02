import { useId } from 'react';
import styles from './CheckoutPage.module.css';

export default function CheckoutArtwork() {
  const id = useId();
  return <div className={styles.artwork} aria-hidden="true">
    <svg viewBox="0 0 320 150" fill="none">
      <defs>
        <linearGradient id={id} x1="90" y1="10" x2="230" y2="145" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCAE91" /><stop offset="1" stopColor="#A45D49" />
        </linearGradient>
      </defs>
      <ellipse cx="164" cy="129" rx="86" ry="12" fill="#000" opacity=".2" />
      <path d="M20 97C77 32 211 152 298 60" stroke="#FCAE91" strokeOpacity=".14" />
      <path d="M34 109C125 41 202 121 285 43" stroke="#FCAE91" strokeOpacity=".09" />
      <g className={styles.artBack} transform="rotate(-13 157 70)">
        <rect x="82" y="23" width="158" height="99" rx="17" fill="#292422" stroke="#53413A" />
        <path d="M100 102h33m6 0h13" stroke="#78594C" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className={styles.artCard}>
        <rect x="92" y="31" width="158" height="99" rx="17" fill={`url(#${id})`} />
        <rect x="93" y="32" width="156" height="97" rx="16" stroke="#FFE6D9" strokeOpacity=".35" />
        <g fill="#38251F" transform="translate(111 51)">
          <rect width="11" height="11" rx="3" /><rect x="14" width="11" height="11" rx="3" opacity=".5" />
          <rect y="14" width="11" height="11" rx="3" opacity=".5" /><rect x="14" y="14" width="11" height="11" rx="3" />
        </g>
        <path d="M111 107h46m11 0h16" stroke="#503025" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
        <path d="M226 57c7 5 7 14 0 19m-6-15c4 3 4 8 0 11" stroke="#503025" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className={styles.artSeal}>
        <circle cx="249" cy="112" r="19" fill="#20231F" stroke="#687860" />
        <path d="m241 112 5 5 10-11" stroke="#B6C9AA" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M68 44v12m-6-6h12" stroke="#FCAE91" strokeOpacity=".6" strokeLinecap="round" />
      <circle cx="280" cy="78" r="2" fill="#FCAE91" opacity=".55" />
    </svg>
  </div>;
}
