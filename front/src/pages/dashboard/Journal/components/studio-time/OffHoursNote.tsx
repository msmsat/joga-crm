// Блок попадает вне рабочего времени (выходной, нерабочий час, перерыв по
// графику). Ставить так можно — уборка до открытия, планёрка в выходной, — но
// окно говорит об этом прямо и называет, у кого: поставить так случайно,
// промахнувшись днём или часом, не должно получаться молча.
import { useTranslation } from 'react-i18next';
import { Moon } from 'lucide-react';
import type { StudioTimeOutside } from '../../../../../api/schedule';
import type { Trainer } from '../../types';

export function OffHoursNote({ outside, trainers }: { outside: StudioTimeOutside[]; trainers: Trainer[] }) {
  const { t } = useTranslation('journal');
  if (!outside.length) return null;
  const who = outside.map(item => {
    const name = trainers.find(person => person.id === item.staff_id)?.name ?? `#${item.staff_id}`;
    return `${name} (${t(`studioTime.offHours.${item.kind}`)})`;
  });
  return (
    <div className="st-off" role="status">
      <span className="st-off-icon" aria-hidden><Moon size={15} strokeWidth={2} /></span>
      <div className="st-off-copy">
        <strong>{t('studioTime.offHours.title')}</strong>
        <span>{who.join(', ')}</span>
        <em>{t('studioTime.offHours.hint')}</em>
      </div>
    </div>
  );
}
