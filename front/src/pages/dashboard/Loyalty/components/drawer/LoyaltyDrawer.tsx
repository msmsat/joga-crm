import type { RefObject } from 'react';
import styles from '../../Loyalty.module.css';
import type { DrawerConfig, Program, ProgramKey } from '../../types';
import type { ProgramConfigs } from '../../hooks/useLoyalty';
import { IconClose } from '../ui/LoyaltyIcons';
import LoyaltyConfig from './configs/LoyaltyConfig';
import DiscountsConfig from './configs/DiscountsConfig';
import CertificatesConfig from './configs/CertificatesConfig';
import SubscriptionsConfig from './configs/SubscriptionsConfig';
import ReferralConfig from './configs/ReferralConfig';

interface Props {
  drawer: DrawerConfig;
  drawerVisible: boolean;
  drawerRef: RefObject<HTMLDivElement | null>;
  configs: ProgramConfigs;
  patchConfig: <K extends ProgramKey>(key: K, patch: Partial<ProgramConfigs[K]>) => void;
  saving: boolean;
  closeDrawer: () => void;
  handleSave: (key: ProgramKey) => void;
  programsList: Program[];
}

function DrawerBody({ drawer, configs, patchConfig }: Pick<Props, 'drawer' | 'configs' | 'patchConfig'>) {
  switch (drawer.key) {
    case 'loyalty':
      return <LoyaltyConfig value={configs.loyalty} onChange={p => patchConfig('loyalty', p)} />;
    case 'discounts':
      return <DiscountsConfig value={configs.discounts} onChange={p => patchConfig('discounts', p)} />;
    case 'certificates':
      return <CertificatesConfig value={configs.certificates} onChange={p => patchConfig('certificates', p)} />;
    case 'subscriptions':
      return <SubscriptionsConfig value={configs.subscriptions} onChange={p => patchConfig('subscriptions', p)} />;
    case 'referral':
      return <ReferralConfig value={configs.referral} onChange={p => patchConfig('referral', p)} />;
  }
}

export default function LoyaltyDrawer({ drawer, drawerVisible, drawerRef, configs, patchConfig, saving, closeDrawer, handleSave, programsList }: Props) {
  return (
    <>
      <div className={`${styles.drawer} ${drawerVisible ? styles.drawerEntering : styles.drawerExiting}`} ref={drawerRef}>
        <div className={styles.drawerHeader}>
          <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(252,174,145,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FCAE91', flexShrink: 0 }}>
            {programsList.find(p => p.key === drawer.key)?.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{drawer.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>Настройка программы</div>
          </div>
          <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <IconClose />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <DrawerBody drawer={drawer} configs={configs} patchConfig={patchConfig} />
        </div>

        <div className={styles.drawerFooter}>
          <button className={styles.topbarBtn} style={{ flex: 1 }} disabled={saving} onClick={() => handleSave(drawer.key)}>
            {saving ? 'Сохранение…' : 'Сохранить и активировать'}
          </button>
          <button className={styles.ghostBtn} onClick={closeDrawer}>Отмена</button>
        </div>
      </div>
    </>
  );
}
