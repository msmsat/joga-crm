import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Switch, useModalClose,
} from '../ui/index';
import { REJECT_ALL, closeCookieSettings, saveConsent, type ConsentChoices } from '../../utils/cookieConsent';
import { useCookieConsent } from '../../hooks/useCookieConsent';
import { COOKIES_URL, LEGAL_LINK_PROPS } from '../../utils/legal';

function CategoryRow({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px',
      padding: '16px 18px', borderRadius: '14px', background: 'rgba(var(--ink),0.03)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.2px' }}>{title}</div>
        <p style={{ margin: '4px 0 0', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--muted)' }}>{text}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, paddingTop: '1px' }}>
        {children}
      </div>
    </div>
  );
}

// Кнопки — отдельным компонентом: закрыть окно с анимацией умеет только
// потомок ModalShell (useModalClose).
function Actions({ choices }: { choices: ConsentChoices }) {
  const { t } = useTranslation('cookies');
  const close = useModalClose();
  const decide = (value: ConsentChoices) => {
    saveConsent(value, 'settings');
    close();
  };
  return (
    <ModalFooter>
      <GhostButton onClick={() => decide(REJECT_ALL)}>{t('actions.reject')}</GhostButton>
      <PrimaryButton onClick={() => decide(choices)}>{t('actions.save')}</PrimaryButton>
    </ModalFooter>
  );
}

/**
 * Выбор по категориям. Переключатели стартуют с уже сделанного выбора, а до
 * первого — выключенными: включённый по умолчанию тумблер — та же заранее
 * поставленная галочка, которую Суд ЕС согласием не признаёт (C-673/17 Planet49).
 * Закрыть окно без сохранения можно — тогда ничего не меняется.
 */
export function CookieSettingsModal() {
  const { t, i18n } = useTranslation('cookies');
  const consent = useCookieConsent();
  const [functional, setFunctional] = useState(consent?.choices.functional ?? false);

  return (
    <ModalShell onClose={closeCookieSettings}>
      <ModalHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <ModalBody>
        <CategoryRow title={t('settings.necessary.title')} text={t('settings.necessary.text')}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {t('settings.alwaysOn')}
          </span>
          <Switch checked disabled onChange={() => undefined} />
        </CategoryRow>

        <CategoryRow title={t('settings.functional.title')} text={t('settings.functional.text')}>
          <Switch checked={functional} onChange={setFunctional} />
        </CategoryRow>

        <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.55, color: 'var(--muted)' }}>
          {t('settings.none')}
        </p>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--muted)' }}>
          {consent && (
            <>
              {t('settings.decided', {
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(consent.decidedAt)),
              })}
              {' · '}
            </>
          )}
          <a href={COOKIES_URL} {...LEGAL_LINK_PROPS} style={{ color: 'var(--peach)', fontWeight: 700, textDecoration: 'none' }}>
            {t('settings.policy')}
          </a>
        </p>
      </ModalBody>
      <Actions choices={{ functional }} />
    </ModalShell>
  );
}
