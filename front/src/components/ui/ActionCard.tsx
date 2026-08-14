import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Card } from './Card';

export interface ActionCardProps {
  /** Человекочитаемое описание предложенного действия (приходит с бэкенда). */
  description: string;
  /** Аргументы инструмента — показываем строками «поле: значение». */
  args?: Record<string, unknown>;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** Уже подтверждено: карточка в истории, кнопок нет, стоит дата. */
  doneAt?: string | null;
}

// Карточка подтверждения действия ассистента (эпик AI-5, задача 10).
// Один компонент на обе поверхности чата: пузырей сообщений в проекте два
// разных (страница AI и дровер), и через месяц две копии разошлись бы в
// поведении — подтверждение из дровера вело бы себя не так, как со страницы.
export function ActionCard({
  description, args, onConfirm, onCancel, loading = false, doneAt = null,
}: ActionCardProps) {
  const { t } = useTranslation();
  const rows = Object.entries(args ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <Card padding={16} style={{ marginTop: 8, opacity: doneAt ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        <strong style={{ fontSize: 14, color: 'var(--text-main, #1A1A1A)' }}>
          {doneAt ? t('ai:actions.done', { date: doneAt }) : t('ai:actions.confirmTitle')}
        </strong>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-soft, #666666)', lineHeight: 1.5 }}>
        {description}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {rows.map(([key, value]) => (
            <div key={key} style={{ fontSize: 13, color: 'var(--text-soft, #666666)' }}>
              <span style={{ opacity: 0.7 }}>{t(`ai:actions.args.${key}`, { defaultValue: key })}: </span>
              <span style={{ color: 'var(--text-main, #1A1A1A)' }}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {!doneAt && (
        // Ряд кнопок переносится на узком экране — карточка живёт внутри ленты
        // сообщений, и на телефоне <768px кнопки не должны уезжать за край.
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Button variant="primary" size="sm" loading={loading} onClick={onConfirm}>
            {t('ai:actions.confirm')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {t('ai:actions.cancel')}
          </Button>
        </div>
      )}
    </Card>
  );
}
