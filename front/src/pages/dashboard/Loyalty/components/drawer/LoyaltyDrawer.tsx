import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../../Loyalty.module.css';
import type { ConfigProgramKey, DrawerConfig, Program } from '../../types';
import type { ProgramConfigs } from '../../hooks/useLoyalty';
import type { ConfigErrors } from '../../hooks/validateConfig';
import type { LoyaltyLevel } from '../../../../../api/loyalty/loyalty.types';
import { IconClose } from '../ui/LoyaltyIcons';
import LoyaltyConfig from './configs/LoyaltyConfig';
import DiscountsConfig from './configs/DiscountsConfig';
import CertificatesConfig from './configs/CertificatesConfig';
import ReferralConfig from './configs/ReferralConfig';
import PromoCodesConfig from './configs/PromoCodesConfig';
import DepositConfig from './configs/DepositConfig';

interface Props {
  drawer: DrawerConfig;
  drawerVisible: boolean;
  drawerRef: RefObject<HTMLDivElement | null>;
  configs: ProgramConfigs;
  patchConfig: <K extends ConfigProgramKey>(key: K, patch: Partial<ProgramConfigs[K]>) => void;
  saving: boolean;
  errors: ConfigErrors;
  levelsDraft: LoyaltyLevel[] | null;
  onUpdateLevel: (id: number, patch: Partial<Pick<LoyaltyLevel, 'name' | 'color' | 'min_threshold'>>) => void;
  onAddLevel: () => void;
  onRemoveLevel: (id: number) => void;
  closeDrawer: () => void;
  handleSave: (key: ConfigProgramKey) => void;
  programsList: Program[];
}

type DrawerBodyProps = Pick<Props, 'drawer' | 'configs' | 'patchConfig' | 'errors' | 'levelsDraft' | 'onUpdateLevel' | 'onAddLevel' | 'onRemoveLevel'>;

function DrawerBody({ drawer, configs, patchConfig, errors, levelsDraft, onUpdateLevel, onAddLevel, onRemoveLevel }: DrawerBodyProps) {
  switch (drawer.key) {
    case 'loyalty':
      return (
        <LoyaltyConfig
          value={configs.loyalty}
          onChange={p => patchConfig('loyalty', p)}
          errors={errors}
          levels={levelsDraft}
          onUpdateLevel={onUpdateLevel}
          onAddLevel={onAddLevel}
          onRemoveLevel={onRemoveLevel}
        />
      );
    case 'discounts':
      return <DiscountsConfig value={configs.discounts} onChange={p => patchConfig('discounts', p)} errors={errors} />;
    case 'certificates':
      return <CertificatesConfig value={configs.certificates} onChange={p => patchConfig('certificates', p)} errors={errors} />;
    case 'referral':
      return <ReferralConfig value={configs.referral} onChange={p => patchConfig('referral', p)} errors={errors} />;
    case 'promocodes':
      return <PromoCodesConfig />;
    case 'deposit':
      return <DepositConfig />;
  }
}

export default function LoyaltyDrawer({ drawer, drawerVisible, drawerRef, configs, patchConfig, saving, errors, levelsDraft, onUpdateLevel, onAddLevel, onRemoveLevel, closeDrawer, handleSave, programsList }: Props) {
  const { t } = useTranslation('loyalty');
  // Промокоды и депозит сохраняют каждую запись сразу (свой CRUD внутри) — не
  // проходят через общий config-конвейер (patchConfig/handleSave/Save-кнопку).
  const configKey = drawer.key === 'promocodes' || drawer.key === 'deposit' ? null : drawer.key;
  return (
    <>
      <div className={`${styles.drawer} ${drawerVisible ? styles.drawerEntering : styles.drawerExiting}`} ref={drawerRef}>
        <div className={styles.drawerHeader}>
          <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(252,174,145,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FCAE91', flexShrink: 0 }}>
            {programsList.find(p => p.key === drawer.key)?.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{drawer.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>{t('drawer.subtitle')}</div>
          </div>
          <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <IconClose />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <DrawerBody
            drawer={drawer}
            configs={configs}
            patchConfig={patchConfig}
            errors={errors}
            levelsDraft={levelsDraft}
            onUpdateLevel={onUpdateLevel}
            onAddLevel={onAddLevel}
            onRemoveLevel={onRemoveLevel}
          />
        </div>

        <div className={styles.drawerFooter}>
          {configKey && (
            <button className={styles.topbarBtn} style={{ flex: 1 }} disabled={saving} onClick={() => handleSave(configKey)}>
              {saving ? t('drawer.saving') : t('drawer.save')}
            </button>
          )}
          <button className={styles.ghostBtn} onClick={closeDrawer} style={configKey ? undefined : { flex: 1 }}>
            {configKey ? t('drawer.cancel') : t('drawer.close')}
          </button>
        </div>
      </div>
    </>
  );
}
