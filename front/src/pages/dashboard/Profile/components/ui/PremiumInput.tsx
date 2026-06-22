import styles from '../../Profile.module.css';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}

export default function PremiumInput({ label, value, onChange, type = 'text' }: Props) {
  return (
    <div className={styles.premiumInputGroup}>
      <label className={styles.floatLabel}>{label}</label>
      <input
        className={styles.premiumInput}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
