import { useTranslation } from 'react-i18next';
import { Steps, Notice } from './ChannelModalLayout';

// Верификацию Business Portfolio проходит САМА студия: её WABA подключён как
// CLIENT_OWNED, приложение Velora к её бизнесу отношения не имеет и пройти это
// за неё не может. Показывается только когда Meta прямо сказала «не пройдена»
// (код 141010 в health_status), а не «на всякий случай».
const SECURITY_CENTER_URL = 'https://business.facebook.com/settings/security';

export function WaVerificationGuide() {
  const { t } = useTranslation('notifications');

  const link = (
    <a
      href={SECURITY_CENTER_URL}
      target="_blank"
      rel="noreferrer"
      style={{ color: '#E8836A', fontWeight: 800 }}
    >
      {t('wa.verify.link')}
    </a>
  );

  return (
    <>
      <Notice tone="warn">
        <strong>{t('wa.verify.title')}</strong> — {t('wa.verify.lead')}
      </Notice>

      <Steps
        title={t('wa.verify.stepsTitle')}
        items={[
          <>{t('wa.verify.step1a')} {link} {t('wa.verify.step1b')}</>,
          t('wa.verify.step2'),
          t('wa.verify.step3'),
          t('wa.verify.step4'),
          t('wa.verify.step5'),
        ]}
      />

      <Notice>
        <strong>{t('wa.verify.docsTitle')}</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
          <li>{t('wa.verify.doc1')}</li>
          <li>{t('wa.verify.doc2')}</li>
        </ul>
      </Notice>

      {/* Самая частая причина отказа — расхождение названия, поэтому вынесено
          отдельно, а не строкой в общем списке. */}
      <Notice tone="warn">
        <strong>{t('wa.verify.pitfallTitle')}</strong> — {t('wa.verify.pitfall')}
      </Notice>
    </>
  );
}
