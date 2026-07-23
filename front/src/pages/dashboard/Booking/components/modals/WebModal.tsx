import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next'
import { IconWeb } from '../ui/BookingIcons'
import { useToast } from '../../../../../components/ui/Toast'

interface Props { onClose(): void }

const WIDGET_CODE = `<script src="https://velora.studio/widget.js"></script>\n<script>\n  Velora.init({ studioId: 'my-studio' });\n</script>`

export function WebModal({ onClose }: Props) {
  const { t } = useTranslation('booking')
  const toast = useToast()

  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(91,171,114,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5BAB72' }}>
              <IconWeb />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>{t('web.title')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub">{t('web.sub')}</div>

        <div className="code-block">
          <div className="code-header">{t('web.codeHeader')}</div>
          <pre>{WIDGET_CODE}</pre>
          <button className="code-copy" onClick={() => { navigator.clipboard.writeText(WIDGET_CODE); toast.success(t('toasts.codeCopied')) }}>{t('web.copy')}</button>
        </div>

        <div className="instruction-box" style={{ marginTop: '16px' }}>
          <div className="ins-step" style={{ marginBottom: 0 }}>
            <div className="ins-num" style={{ background: 'var(--accent)' }}>!</div>
            <div className="ins-text">{t('web.instructionPrefix')}<code>&lt;/body&gt;</code>{t('web.instructionSuffix')}</div>
          </div>
        </div>
      </div>
    </div>,
  document.body
  )
}
