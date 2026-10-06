// Кнопка «Время студии» в шапке окон создания (новое занятие, запись у клетки,
// мастер записи на телефоне): то же место в сетке, но без занятия — уборка,
// подготовка, планёрка. Окно получает её готовой (проп headAction), чтобы
// самим окнам не знать про «Время студии» ничего, кроме места для кнопки.
import { NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './studioTime.css';

export function StudioTimeButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation('journal');
  return (
    <button type="button" className="st-trigger" onClick={onClick} disabled={disabled}
            onMouseDown={e => e.stopPropagation()}
            title={t('studioTime.actionHint')} aria-label={t('studioTime.action')}>
      <span className="st-trigger-icon" aria-hidden><NotebookPen size={13} strokeWidth={2} /></span>
      <span className="st-trigger-label">{t('studioTime.action')}</span>
    </button>
  );
}
