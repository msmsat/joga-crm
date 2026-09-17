import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import * as Icons from '../../../../../components/Icons'
import { Button, QrShareModal } from '../../../../../components/ui/index'
import { useToast } from '../../../../../components/ui/Toast'
import { useStudioSettings } from '../../../../../hooks/useStudioCurrency'

const COLOR = '#5BAB72'

/**
 * Ссылка, по которой клиент открывает мини-приложение студии. Ровно та же, что
 * бот отдаёт на /start — собирает её бэк (`miniapp_url` в настройках записи),
 * потому что адрес зависит от окружения, а не от того, где открыт фронт.
 *
 * Сам код и всё, что с ним делают (печать плаката, картинка для сторис,
 * копирование), живут в общей модалке кита — там же, где QR занятия и
 * абонемента: три копии одного плаката разъехались бы на первой правке.
 */
export function MiniappCard({ url }: { url: string }) {
  const { t } = useTranslation('booking')
  const toast = useToast()
  const { data: studio } = useStudioSettings()
  const [isQrOpen, setIsQrOpen] = useState(false)

  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast.success(t('toasts.linkCopied'))
  }

  // Схему прячем: «api.jogaua.online/s/k3m9x2ptqv» читается, «https://…» — просто шум.
  const pretty = url.replace(/^https?:\/\//, '')

  return (
    <div className="channel-card miniapp-card" style={{ '--channel-color': COLOR } as React.CSSProperties}>
      <div className="miniapp-qr">
        {url
          ? <QRCodeSVG value={url} size={84} level="M" bgColor="#FFFFFF" fgColor="#1A1A1A" marginSize={0} />
          : <div className="miniapp-qr-empty" />}
      </div>

      <div className="miniapp-body">
        <div className="channel-name">{t('channels.miniapp.name')}</div>
        <div className="channel-desc">{t('channels.miniapp.desc')}</div>

        <div className="channel-link" onClick={copy} style={{ cursor: url ? 'pointer' : 'default' }}>
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

        <div className="miniapp-print">
          <Button variant="primary" size="sm" fullWidth icon={<Icons.QrCode />} onClick={() => setIsQrOpen(true)} disabled={!url}>
            {t('common:qr.title')}
          </Button>
        </div>
      </div>

      {isQrOpen && url && (
        <QrShareModal
          url={url}
          kicker={studio?.name}
          title={t('channels.miniapp.posterTitle')}
          caption={t('channels.miniapp.scanHint')}
          fileName={studio?.name}
          onClose={() => setIsQrOpen(false)}
        />
      )}
    </div>
  )
}
