import { useTranslation } from 'react-i18next';
import type { ConfigProgramKey, DrawerConfig, Program } from '../../types';
import type { ProgramConfigs } from '../../hooks/useLoyalty';
import type { ConfigErrors } from '../../hooks/validateConfig';
import type { LoyaltyLevel } from '../../../../../api/loyalty/loyalty.types';
import { Button, SidePanel, SidePanelBody, SidePanelFoot, SidePanelHead, cascade } from '../../../../../components/ui/index';
import LoyaltyConfig from './configs/LoyaltyConfig';
import CertificatesConfig from './configs/CertificatesConfig';
import ReferralConfig from './configs/ReferralConfig';
import FirstLessonConfig from './configs/FirstLessonConfig';
import PromoCodesConfig from './configs/PromoCodesConfig';
import DepositConfig from './configs/DepositConfig';
import DiscountsPanel from './discounts/DiscountsPanel';

interface Props {
  drawer: DrawerConfig;
  drawerOpen: boolean;
  onClosed: () => void;
  configs: ProgramConfigs;
  patchConfig: <K extends ConfigProgramKey>(key: K, patch: Partial<ProgramConfigs[K]>) => void;
  saving: boolean;
  errors: ConfigErrors;
  levelsDraft: LoyaltyLevel[] | null;
  onUpdateLevel: (id: number, patch: Partial<Pick<LoyaltyLevel, 'name' | 'color' | 'min_threshold' | 'point_value'>>) => void;
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
    case 'certificates':
      return <CertificatesConfig value={configs.certificates} onChange={p => patchConfig('certificates', p)} errors={errors} />;
    case 'referral':
      return <ReferralConfig value={configs.referral} onChange={p => patchConfig('referral', p)} errors={errors} />;
    case 'first_lesson':
      return <FirstLessonConfig value={configs.first_lesson} onChange={p => patchConfig('first_lesson', p)} errors={errors} />;
    case 'promocodes':
      return <PromoCodesConfig />;
    case 'deposit':
      return <DepositConfig />;
    case 'discounts':
      return null; // своя панель целиком — DiscountsPanel
  }
}

// Ширина на большом экране. Скидкам нужно место: превью, календарь рядом с
// быстрыми периодами, плитки групп в три колонки. Остальные — формы в столбик.
const WIDTH = { discounts: 660, wide: 460 } as const;

export default function LoyaltyDrawer({ drawer, drawerOpen, onClosed, configs, patchConfig, saving, errors, levelsDraft, onUpdateLevel, onAddLevel, onRemoveLevel, closeDrawer, handleSave, programsList }: Props) {
  const { t } = useTranslation('loyalty');
  const icon = programsList.find(p => p.key === drawer.key)?.icon;
  // Промокоды и депозит сохраняют каждую запись сразу (свой CRUD внутри) — не
  // проходят через общий config-конвейер (patchConfig/handleSave/Save-кнопку).
  const configKey = drawer.key === 'promocodes' || drawer.key === 'deposit' || drawer.key === 'discounts' ? null : drawer.key;

  return (
    <SidePanel
      open={drawerOpen}
      onClose={closeDrawer}
      onClosed={onClosed}
      width={drawer.key === 'discounts' ? WIDTH.discounts : WIDTH.wide}
      ariaLabel={drawer.title}
    >
      {drawer.key === 'discounts' ? (
        <DiscountsPanel
          title={drawer.title}
          icon={icon}
          config={configs.discounts}
          onClose={closeDrawer}
        />
      ) : (
        <>
          <SidePanelHead icon={icon} title={drawer.title} subtitle={t('drawer.subtitle')} onClose={closeDrawer} />
          <SidePanelBody>
            <div className="spanel-cascade" style={cascade(1)}>
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
          </SidePanelBody>
          <SidePanelFoot>
            <Button variant="ghost" onClick={closeDrawer} style={{ flex: configKey ? '0 0 auto' : 1 }}>
              {configKey ? t('drawer.cancel') : t('drawer.close')}
            </Button>
            {configKey && (
              <Button loading={saving} onClick={() => handleSave(configKey)} style={{ flex: 1 }}>
                {saving ? t('drawer.saving') : t('drawer.save')}
              </Button>
            )}
          </SidePanelFoot>
        </>
      )}
    </SidePanel>
  );
}
