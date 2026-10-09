import type { CSSProperties } from 'react';
import styles from './RollingAmount.module.css';

interface Props {
  /** Готовая строка суммы (formatMoney): цифры крутятся, остальное стоит. */
  text: string;
  className?: string;
}

const DIGITS = [...'0123456789'];

/**
 * Сумма барабаном: каждая цифра — лента 0–9 в окне высотой в строку, и новая
 * сумма доезжает до своих цифр, а не подменяется. Видно, куда двинулась цена:
 * ползунок вправо — ленты едут вверх.
 *
 * Разряды ключуются справа налево: у «€99» → «€105» единицы остаются
 * единицами, а сотни встают слева, вместо того чтобы все ленты разом съехали
 * на разряд. Читалка экрана получает строку целиком из скрытой копии.
 */
export default function RollingAmount({ text, className = '' }: Props) {
  const chars = [...text];
  return (
    <span className={`${styles.roll} ${className}`}>
      <span className={styles.srOnly}>{text}</span>
      <span className={styles.face} aria-hidden="true">
        {chars.map((ch, i) => {
          const place = chars.length - i;
          const digit = DIGITS.indexOf(ch);
          return digit < 0
            ? <span key={`s${place}`} className={styles.sign}>{ch}</span>
            : (
              <span key={`d${place}`} className={styles.cell}>
                <span className={styles.reel} style={{ '--d': digit, '--i': i } as CSSProperties}>
                  {DIGITS.map(n => <span key={n}>{n}</span>)}
                </span>
              </span>
            );
        })}
      </span>
    </span>
  );
}
