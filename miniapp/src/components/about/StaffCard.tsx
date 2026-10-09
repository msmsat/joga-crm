import { useState } from 'react';
import type { StudioStaff } from '../../api/studio';
import { RatingMark } from './Rating';
import './about.css';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase() || '•';

/**
 * Визитка мастера: фото, имя, должность, его средняя оценка и «О себе».
 *
 * Тёмный матовый камень — один сильный предмет в раскрытой карточке, а не
 * ещё одна белая плашка среди белых. Тексты — ровно как написал владелец
 * в CRM → Сотрудники; наш текст их не дополняет.
 */
export function StaffCard({ member, kicker }: { member: StudioStaff; kicker: string }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : member.photo_url;

  return (
    <div className="ab-card">
      <div className="flex items-center gap-3.5">
        {photo ? (
          <img src={photo} alt="" onError={() => setBroken(true)} className="ab-photo" />
        ) : (
          <span aria-hidden="true" className="ab-photo ab-initials">{initials(member.name)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="ab-card-kicker">{kicker}</div>
          <div className="ab-name mt-1 truncate">{member.name}</div>
          {member.department && <div className="ab-role truncate">{member.department}</div>}
        </div>
        {member.rating_avg != null && <RatingMark avg={member.rating_avg} className="ab-score self-start" />}
      </div>
      {member.bio && <p className="ab-bio">{member.bio}</p>}
    </div>
  );
}
