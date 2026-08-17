import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import type { LoyaltyOverview } from '../../api/loyalty';

interface ClubInfoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  data: LoyaltyOverview;
}

// Сроки сгорания приходят ключом ('3m' | '6m' | '1y' | 'never'). Белый список,
// а не подстановка ключа в t(): незнакомое значение из БД иначе вылезло бы
// клиенту строкой «club.info.expiry.7m».
const EXPIRY_KEYS = ['3m', '6m', '1y', 'never'];

/**
 * «Как это работает» — правила клуба словами и цифрами этой студии.
 *
 * Разделы те же и в том же порядке, что на странице, и по тем же условиям:
 * у кого нет депозита, тому незачем читать, как он списывается. Каждое правило
 * — то, что реально делает сервер, а не рекламное обещание: курс начисления из
 * конфига студии (accrue_points), цена балла при оплате и порядок списаний из
 * расчёта чека (_quote). Поэтому цифры здесь и в чеке не разойдутся.
 */
export default function ClubInfoSheet({ isOpen, onClose, data }: ClubInfoSheetProps) {
  const { t } = useTranslation();

  const expiryKey = EXPIRY_KEYS.includes(data.points_expiry) ? data.points_expiry : 'never';

  const blocks: { key: string; title: string; lines: string[] }[] = [
    {
      key: 'points',
      title: t('club.info.points_title'),
      lines: [
        t('club.info.points_earn', { rate: data.earn_rate_str }),
        t('club.info.points_spend', { unit: data.point_unit_str }),
        t('club.info.points_balance', {
          points: data.points_balance,
          value: data.points_value_str,
        }),
        t(`club.info.points_expiry_${expiryKey}`),
      ].concat(
        // Цена балла растёт с уровнем — говорим об этом там, где человек
        // читает про баллы, а не только в блоке уровней.
        data.next_point_unit_str
          ? [t('club.info.points_grow', { value: data.next_point_unit_str })]
          : [],
      ),
    },
  ];

  if (data.levels.length > 0) {
    // Выгода уровня — цена балла. Если владелец её не настраивал и на всех
    // ступенях балл стоит одинаково, обещать выгоду нельзя: скидки уровень не
    // даёт (её считает resolve_price, и там уровня нет вовсе).
    const dearest = data.levels.reduce((max, lvl) => Math.max(max, lvl.point_value), 0);
    const hasBenefit = data.levels.some((lvl) => lvl.point_value !== data.levels[0].point_value);
    const top = data.levels.find((lvl) => lvl.point_value === dearest);

    blocks.push({
      key: 'levels',
      title: t('club.levels'),
      lines: [
        t('club.info.levels_how'),
        hasBenefit && top
          ? t('club.info.levels_benefit', {
              unit: data.point_unit_str,
              level: top.name,
              value: top.point_value_str,
            })
          : t('club.info.levels_what'),
      ],
    });
  }

  if (data.offers.length > 0) {
    blocks.push({
      key: 'offers',
      title: t('club.offers'),
      lines: [t('club.info.offers_what'), t('club.info.offers_once')],
    });
  }

  if (data.certificates.length > 0) {
    blocks.push({
      key: 'certificates',
      title: t('club.certificates'),
      lines: [t('club.info.cert_what'), t('club.info.cert_how')],
    });
  }

  if (data.deposit_balance > 0) {
    blocks.push({
      key: 'deposit',
      title: t('club.deposit'),
      lines: [
        t('club.info.deposit_what'),
        t('club.info.deposit_balance', { value: data.deposit_balance_str }),
      ],
    });
  }

  if (data.referral) {
    blocks.push({
      key: 'referral',
      title: t('club.referral'),
      lines: [
        data.referral.bonus_type === 'points'
          ? t('club.info.referral_you_points', { bonus: data.referral.referrer_bonus })
          : t('club.info.referral_you_money', { bonus: data.referral.referrer_bonus_str }),
        data.referral.new_client_discount > 0
          ? t('club.info.referral_friend', { discount: data.referral.new_client_discount })
          : t('club.info.referral_friend_none'),
      ],
    });
  }

  // Порядок списаний — последним: он про то, как перечисленное складывается
  // в один чек, и читается только после самих механик.
  blocks.push({
    key: 'order',
    title: t('club.info.order_title'),
    lines: [t('club.info.order_steps'), t('club.info.order_note')],
  });

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={data.program_name}
      title={t('club.info.title')}
      subtitle={t('club.info.subtitle')}
    >
      <div className="flex flex-col gap-2.5">
        {blocks.map((block) => (
          <div key={block.key} className="rounded-[18px] bg-background px-4 py-4">
            <div className="text-[13.5px] font-extrabold tracking-[-0.015em] text-foreground">
              {block.title}
            </div>
            {block.lines.map((line) => (
              <div key={line} className="mt-2 flex gap-2.5">
                {/* Точка вместо маркера списка: у ul свои отступы браузера,
                    которые в шите пришлось бы гасить. */}
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand"
                />
                <span className="text-[12.5px] font-medium leading-[1.5] text-muted-foreground">
                  {line}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
