import type { RefObject } from 'react';
import styles from '../../Loyalty.module.css';
import type { DrawerConfig, Program, ProgramKey } from '../../types';
import { IconClose } from '../ui/LoyaltyIcons';
import LoyaltyConfig from './configs/LoyaltyConfig';
import DiscountsConfig from './configs/DiscountsConfig';
import CertificatesConfig from './configs/CertificatesConfig';
import SubscriptionsConfig from './configs/SubscriptionsConfig';
import ReferralConfig from './configs/ReferralConfig';

function DrawerBody({ drawerKey }: { drawerKey: ProgramKey }) {
  switch (drawerKey) {
    case 'loyalty':       return <LoyaltyConfig />;
    case 'discounts':     return <DiscountsConfig />;
    case 'certificates':  return <CertificatesConfig />;
    case 'subscriptions': return <SubscriptionsConfig />;
    case 'referral':      return <ReferralConfig />;
  }
}

interface Props {
  drawer: DrawerConfig;
  drawerVisible: boolean;
  drawerRef: RefObject<HTMLDivElement | null>;
  closeDrawer: () => void;
  handleSave: (key: ProgramKey) => void;
  programsList: Program[];
}

export default function LoyaltyDrawer({ drawer, drawerVisible, drawerRef, closeDrawer, handleSave, programsList }: Props) {
  return (
    <>
      <div className={styles.drawerOverlay} onClick={closeDrawer} />
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
          <DrawerBody drawerKey={drawer.key} />
        </div>

        <div className={styles.drawerFooter}>
          <button className={styles.topbarBtn} style={{ flex: 1 }} onClick={() => handleSave(drawer.key)}>
            Сохранить и активировать
          </button>
          <button className={styles.ghostBtn} onClick={closeDrawer}>Отмена</button>
        </div>
      </div>
    </>
  );
}
