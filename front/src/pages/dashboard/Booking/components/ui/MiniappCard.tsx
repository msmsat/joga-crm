import { useTranslation } from 'react-i18next'
import { IconLink } from './BookingIcons'
import { useToast } from '../../../../../components/ui/Toast'

const COLOR = '#5BAB72'

/**
 * Ссылка, по которой клиент открывает мини-приложение студии. Ровно та же, что
 * бот отдаёт на /start — собирает её бэк (`miniapp_url` в настройках записи),
 * потому что адрес зависит от окружения, а не от того, где открыт фронт.
 *
 * Клик по карточке = копирование: за ссылкой сюда и приходят.
 */
export function MiniappCard({ url }: { url: string }) {
  const { t } = useTranslation('booking')
  const toast = useToast()

  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast.success(t('toasts.linkCopied'))
  }

  // Схему прячем: «api.jogaua.online/s/12» читается, «https://…» — просто шум.
  const pretty = url.replace(/^https?:\/\//, '')

  return (
    <div
      className="channel-card channel-card-link"
      onClick={copy}
      style={{ '--channel-color': COLOR, cursor: url ? 'pointer' : 'default' } as React.CSSProperties}
    >
      <div className="channel-icon-wrap" style={{ background: `${COLOR}18`, color: COLOR }}>
        <IconLink />
      </div>
      <div className="channel-name">{t('channels.miniapp.name')}</div>
      <div className="channel-desc">{t('channels.miniapp.desc')}</div>

      <div className="channel-link">
        <span className="channel-link-url" title={url}>{pretty || '…'}</span>
        {url && (
          <>
            <button
              type="button"
              className="channel-link-btn"
              onClick={e => { e.stopPropagation(); copy() }}
              aria-label={t('channels.miniapp.copy')}
              title={t('channels.miniapp.copy')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2.5"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <a
              className="channel-link-btn"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label={t('channels.miniapp.open')}
              title={t('channels.miniapp.open')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <path d="M15 3h6v6"/><path d="M10 14 21 3"/>
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  )
}
