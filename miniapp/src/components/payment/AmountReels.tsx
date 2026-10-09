import type { CSSProperties } from 'react';
import styles from './AmountReels.module.css';

// Два круга цифр: барабан делает полный оборот и встаёт на свою.
const REEL = Array.from({ length: 20 }, (_, index) => index % 10);

/**
 * Сумма чека барабанами, как на механическом табло. Строку сервер присылает
 * готовой (знак, разряды, копейки по языку студии) — крутятся только цифры,
 * остальные символы стоят на месте.
 *
 * Все барабаны трогаются вместе и встают по очереди слева направо, как
 * барабаны автомата. Ширину держит невидимая цифра того же разряда, поэтому
 * строка не меняет раскладку ни на одном кадре.
 */
export default function AmountReels({ value }: { value: string }) {
  let order = 0;
  return (
    <span className={styles.amount}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className={styles.line}>
        {Array.from(value).map((char, index) => {
          if (char < '0' || char > '9') return <span key={index} className={styles.lit}>{char}</span>;
          const digit = Number(char);
          const style = { '--d': digit, '--n': order++ } as CSSProperties;
          return (
            <span key={index} className={styles.slot}>
              <span className={styles.ghost}>{digit}</span>
              <span className={styles.reel} style={style}>
                {REEL.map((n, at) => <span key={at}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
