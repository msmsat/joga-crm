import type { ReactNode } from 'react';
import { ChevronRight } from './icons';
import s from './PhoneOverview.module.css';

interface Props {
  title: string;
  subtitle?: string;
  /** Число рядом с заголовком — сколько там дел (задачи). */
  count?: number;
  action?: string;
  onAction?: () => void;
  /** Что-то своё справа вместо ссылки. */
  aside?: ReactNode;
}

/** Заголовок раздела телефонной главной: на фоне страницы, а не внутри карточки. */
export default function SectionHead({ title, subtitle, count, action, onAction, aside }: Props) {
  return (
    <div className={s.head}>
      <div className={s.headText}>
        <h2 className={s.headTitle}>
          {title}
          {count != null && count > 0 && <span className={s.count}>{count}</span>}
        </h2>
        {subtitle && <p className={s.headSub}>{subtitle}</p>}
      </div>
      {aside}
      {action && onAction && (
        <button type="button" className={s.headAction} onClick={onAction}>
          {action}
          <ChevronRight />
        </button>
      )}
    </div>
  );
}
