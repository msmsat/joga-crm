import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { INSTAGRAM_RE, instagramNick } from '../../../hooks/useClientForm';
import s from '../AddClientModal.module.css';

/** Подпись поля и рядом — видная метка: «Обязательно» или «Необязательно».
    Человек не должен гадать по звёздочке, что можно пропустить. */
export function FieldLabel({ label, required, htmlFor }: { label: string; required?: boolean; htmlFor?: string }) {
  const { t } = useTranslation('clients');
  return (
    <div className={s.labelRow}>
      <label className={s.label} htmlFor={htmlFor}>{label}</label>
      <span className={required ? s.badgeRequired : s.badgeOptional}>
        {t(required ? 'addModal.required' : 'addModal.optional')}
      </span>
    </div>
  );
}

function Feedback({ error, hint, id }: { error?: string; hint?: string; id?: string }) {
  if (error) return <div id={id} role="alert" className={s.error}>{error}</div>;
  return hint ? <div id={id} className={s.hint}>{hint}</div> : null;
}

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>;

export function Field({ label, required, value, onChange, error, hint, rows, inputClassName, ...native }: NativeProps & {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  error?: string; hint?: string; rows?: number; inputClassName?: string;
}) {
  const id = useId();
  const cls = inputClassName ? `${s.input} ${inputClassName}` : s.input;
  return (
    <div className={s.field}>
      <FieldLabel label={label} required={required} htmlFor={id}/>
      {rows ? (
        <textarea
          id={id} className={cls} rows={rows} value={value} placeholder={native.placeholder}
          aria-required={required} aria-describedby={error || hint ? `${id}-feedback` : undefined}
          aria-invalid={!!error} onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          {...native} id={id} className={cls} value={value}
          required={required} aria-describedby={error || hint ? `${id}-feedback` : undefined}
          aria-invalid={!!error} onChange={e => onChange(e.target.value)}
        />
      )}
      <Feedback id={`${id}-feedback`} error={error} hint={hint}/>
    </div>
  );
}

/** Контейнер чужого поля (телефон с маской, теги кита) под общей подписью. */
export function FieldSlot({ label, error, hint, className, children }: {
  label: string; error?: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className ? `${s.field} ${className}` : s.field} role="group" aria-label={label} aria-invalid={!!error}>
      <FieldLabel label={label}/>
      {children}
      <Feedback error={error} hint={hint}/>
    </div>
  );
}

// Глиф Instagram: фирменный градиент живёт только в иконке — крупных заливок
// чужим брендом в кабинете быть не должно (CLAUDE.md §6).
function IconInstagram({ active }: { active: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round">
      <defs>
        <linearGradient id="acIgGrad" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0" stopColor="#FEDA75"/><stop offset="0.35" stopColor="#FA7E1E"/>
          <stop offset="0.7" stopColor="#D62976"/><stop offset="1" stopColor="#962FBF"/>
        </linearGradient>
      </defs>
      <g stroke={active ? 'url(#acIgGrad)' : 'currentColor'}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.6"/>
        <circle cx="12" cy="12" r="4.4"/>
        <circle cx="17.4" cy="6.6" r="1.1" fill={active ? 'url(#acIgGrad)' : 'currentColor'} stroke="none"/>
      </g>
    </svg>
  );
}

/** Ник в Instagram: «@» рисует само поле, ссылку на профиль показывает справа,
    как только ник становится похож на настоящий. */
export function InstagramField({ value, onChange, error }: {
  value: string; onChange: (v: string) => void; error?: string;
}) {
  const { t } = useTranslation('clients');
  const id = useId();
  const valid = INSTAGRAM_RE.test(value);
  return (
    <div className={s.field}>
      <FieldLabel label={t('addModal.step1.instagram')} htmlFor={id}/>
      <div className={s.affix} aria-invalid={!!error}>
        <span className={s.affixIcon}><IconInstagram active={valid}/></span>
        <span className={s.affixAt}>@</span>
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-feedback` : undefined}
          className={s.affixInput}
          value={value}
          onChange={e => onChange(instagramNick(e.target.value))}
          placeholder={t('addModal.step1.instagramPlaceholder')}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        {valid && (
          <a className={s.affixLink} href={`https://instagram.com/${value}`} target="_blank" rel="noopener" title={`instagram.com/${value}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        )}
      </div>
      <Feedback id={`${id}-feedback`} error={error}/>
    </div>
  );
}
