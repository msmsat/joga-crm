import styles from '../../Loyalty.module.css';
import { PROGRAM_METADATA } from '../../constants';

// Скелетон первой загрузки (задача 8): вместо ложного «Не настроена» на всех
// карточках, пока GET-конфиги ещё не пришли. Число карточек = PROGRAM_METADATA,
// сетка — тот же класс, что у настоящих карточек: при загрузке ничего не прыгает.
export default function ProgramsGridSkeleton() {
  return (
    <div className={styles.programs} style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
      {PROGRAM_METADATA.map((meta, i) => (
        <div key={meta.key} className={styles.programCard} style={{ animationDelay: `${i * 0.05}s`, display: 'flex', flexDirection: 'column' }}>
          <div className={styles.skel} style={{ width: '40px', height: '40px', borderRadius: '10px', marginBottom: '14px' }} />
          <div className={styles.skel} style={{ width: '70%', height: '13px', marginBottom: '8px' }} />
          <div className={styles.skel} style={{ width: '90%', height: '11px', marginBottom: '4px' }} />
          <div className={styles.skel} style={{ width: '60%', height: '11px', marginBottom: '16px' }} />
          <div className={styles.skel} style={{ width: '100%', height: '30px', borderRadius: 'var(--radius-sm)', marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  );
}
