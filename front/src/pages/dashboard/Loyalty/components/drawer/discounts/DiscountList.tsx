import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button, cascade } from '../../../../../../components/ui/index';
import type { DiscountCampaign, DiscountConfig } from '../../../../../../api/loyalty/loyalty.types';
import s from './Discounts.module.css';
import DiscountTimeline from './DiscountTimeline';
import DiscountCard from './DiscountCard';
import ProgramRules from './ProgramRules';
import { TEMPLATES, fromTemplate, type DiscountDraft } from './discountModel';
import { useDiscountCatalog } from './useDiscountCatalog';
import { IconSparkle, TemplateIcon } from './DiscountIcons';

interface Props {
  campaigns: DiscountCampaign[];
  loading: boolean;
  config: DiscountConfig | null;
  highlightId: number | null;
  busyId: number | null;
  onOpen: (campaign: DiscountCampaign) => void;
  onCreate: (draft?: DiscountDraft) => void;
  onToggle: (campaign: DiscountCampaign, active: boolean) => void;
  onEnableProgram: () => void;
  enabling: boolean;
}

const ORDER = { active: 0, scheduled: 1, paused: 2, ended: 3 } as const;

export default function DiscountList({
  campaigns, loading, config, highlightId, busyId, onOpen, onCreate, onToggle, onEnableProgram, enabling,
}: Props) {
  const { t } = useTranslation('loyalty');
  const { packages } = useDiscountCatalog();
  const sorted = [...campaigns].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const count = (status: DiscountCampaign['status']) => campaigns.filter(c => c.status === status).length;
  const used = campaigns.reduce((sum, c) => sum + c.used_count, 0);
  const programOff = config != null && !config.is_enabled && campaigns.length > 0;

  return (
    <div className={s.list}>
      {programOff && (
        <div className={`${s.banner} spanel-cascade`} style={cascade(1)} role="status">
          <div>
            <div className={s.bannerTitle}>{t('discounts.list.offTitle')}</div>
            <div className={s.bannerText}>{t('discounts.list.offText')}</div>
          </div>
          <Button size="sm" loading={enabling} onClick={onEnableProgram}>{t('discounts.list.turnOn')}</Button>
        </div>
      )}

      {loading ? (
        <div className={s.skeletons} aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className={`${s.empty} spanel-cascade`} style={cascade(1)}>
          <div className={s.emptyBadge}><IconSparkle size={22} /></div>
          <div className={s.emptyTitle}>{t('discounts.list.emptyTitle')}</div>
          <div className={s.emptyText}>{t('discounts.list.emptyText')}</div>
          <div className={s.emptyTemplates}>
            {TEMPLATES.map(key => (
              <button key={key} type="button" className={s.template}
                      onClick={() => onCreate(fromTemplate(key, t(`discounts.templates.${key}.name`), packages))}>
                <span className={s.templateIcon}><TemplateIcon name={key} /></span>
                <span className={s.templateName}>{t(`discounts.templates.${key}.name`)}</span>
                <span className={s.templateSub}>{t(`discounts.templates.${key}.hint`)}</span>
              </button>
            ))}
            <button type="button" className={`${s.template} ${s.templateBlank}`} onClick={() => onCreate()}>
              <span className={s.templateIcon}><TemplateIcon name="blank" /></span>
              <span className={s.templateName}>{t('discounts.templates.blank.name')}</span>
              <span className={s.templateSub}>{t('discounts.templates.blank.hint')}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`${s.hero} spanel-cascade`} style={cascade(1)}>
            <div className={s.heroStats}>
              <div className={s.heroStat}>
                <span className={s.heroNum}>{count('active')}</span>
                <span className={s.heroLabel}>{t('discounts.list.active')}</span>
              </div>
              <div className={s.heroStat}>
                <span className={s.heroNum}>{count('scheduled')}</span>
                <span className={s.heroLabel}>{t('discounts.list.scheduled')}</span>
              </div>
              <div className={s.heroStat}>
                <span className={s.heroNum}>{used}</span>
                <span className={s.heroLabel}>{t('discounts.list.used')}</span>
              </div>
            </div>
            <DiscountTimeline campaigns={campaigns} onOpen={onOpen} />
          </div>
          <div className={`${s.cards} spanel-cascade`} style={cascade(2)}>
            <AnimatePresence initial={false}>
              {sorted.map((c, i) => (
                <DiscountCard
                  key={c.id}
                  campaign={c}
                  index={i}
                  highlighted={c.id === highlightId}
                  busy={busyId === c.id}
                  onOpen={() => onOpen(c)}
                  onToggle={active => onToggle(c, active)}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      <div className="spanel-cascade" style={cascade(3)}>
        <ProgramRules key={String(config?.cashback_percent)} config={config} />
      </div>
    </div>
  );
}
