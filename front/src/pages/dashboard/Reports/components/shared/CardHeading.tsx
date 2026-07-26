import { useTranslation } from 'react-i18next';
import { InfoHint, Tooltip } from '../../../../../components/ui/index';

export interface CardHeadingProps {
  title: string;
  description?: string;   // короткая расшифровка под заголовком
  formulaKey?: string;    // ключ formulas.* → InfoHint с формулой
  actions?: React.ReactNode;
  style?: React.CSSProperties; // для контейнеров с нестандартным padding (напр. Card padding=0)
  /** Полный текст тултипа «метрика не фильтруется» — см. useScopeNote. Капсула
   * рендерится справа от description только когда прокинут. */
  scopeNote?: string;
}

export function CardHeading({ title, description, formulaKey, actions, style, scopeNote }: CardHeadingProps) {
  const { t } = useTranslation('reports');
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.2px' }}>{title}</h3>
          {(description || scopeNote) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '3px' }}>
              {description && (
                <p style={{ fontSize: '12px', lineHeight: 1.45, color: 'var(--text3)', margin: 0, maxWidth: '52ch' }}>
                  {description}
                </p>
              )}
              {scopeNote && (
                <Tooltip label={scopeNote} side="top">
                  <span style={{
                    fontSize: '10.5px', fontWeight: 600, color: 'var(--text3)',
                    background: 'rgba(26,26,26,0.05)', borderRadius: '6px', padding: '2px 6px', flexShrink: 0,
                  }}>
                    {t('scopeNote.label')}
                  </span>
                </Tooltip>
              )}
            </div>
          )}
        </div>
        {formulaKey && <InfoHint title={t(`formulas.${formulaKey}.title`)} text={t(`formulas.${formulaKey}.text`)} />}
      </div>
      {actions}
    </div>
  );
}
