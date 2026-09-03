import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { IconPrint } from './BookingIcons'
import { Button } from '../../../../../components/ui/index'
import { useToast } from '../../../../../components/ui/Toast'
import { useStudioSettings } from '../../../../../hooks/useStudioCurrency'

const COLOR = '#5BAB72'

const esc = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/**
 * Ссылка, по которой клиент открывает мини-приложение студии. Ровно та же, что
 * бот отдаёт на /start — собирает её бэк (`miniapp_url` в настройках записи),
 * потому что адрес зависит от окружения, а не от того, где открыт фронт.
 *
 * QR ведёт туда же: студии нужен код на стойку и в раздатку, а не только
 * ссылка для сторис. Печать открывает отдельное окно с плакатом — так лист
 * получается сам по себе, без войны с версткой дашборда в @media print.
 */
export function MiniappCard({ url }: { url: string }) {
  const { t } = useTranslation('booking')
  const toast = useToast()
  const qrRef = useRef<HTMLDivElement>(null)
  const { data: studio } = useStudioSettings()

  function copy() {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast.success(t('toasts.linkCopied'))
  }

  // Схему прячем: «api.jogaua.online/s/k3m9x2ptqv» читается, «https://…» — просто шум.
  const pretty = url.replace(/^https?:\/\//, '')

  function printQr() {
    // Печатаем ровно тот <svg>, что на экране: у него есть viewBox, поэтому на
    // листе он тянется до 300px без потери чёткости — растр пришлось бы рисовать заново.
    const svg = qrRef.current?.querySelector('svg')?.outerHTML
    if (!svg) return
    const w = window.open('', '_blank', 'width=760,height=980')
    if (!w) { toast.error(t('toasts.printBlocked')); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(studio?.name || pretty)}</title>
<style>
  @page { size: A4; margin: 0 }
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { font-family: Manrope, Inter, system-ui, sans-serif; color: #1A1A1A; background: #fff;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 48px }
  .sheet { text-align: center; max-width: 540px }
  .studio { font-size: 14px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
            color: #9A9A9A; margin-bottom: 12px }
  h1 { font-size: 38px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 32px }
  .qr { display: inline-block; padding: 26px; border-radius: 28px; border: 1.5px solid #EEEBE6;
        box-shadow: 0 18px 48px rgba(0,0,0,.07) }
  .qr svg { display: block; width: 300px; height: 300px }
  .hint { margin-top: 28px; font-size: 17px; color: #666 }
  .url { margin-top: 10px; font-size: 15px; font-family: ui-monospace, Menlo, monospace; color: #1A1A1A }
  @media print { body { padding: 0 } .qr { box-shadow: none } }
</style></head>
<body onload="print()" onafterprint="close()">
  <div class="sheet">
    ${studio?.name ? `<div class="studio">${esc(studio.name)}</div>` : ''}
    <h1>${esc(t('channels.miniapp.posterTitle'))}</h1>
    <div class="qr">${svg}</div>
    <div class="hint">${esc(t('channels.miniapp.scanHint'))}</div>
    <div class="url">${esc(pretty)}</div>
  </div>
</body></html>`)
    w.document.close()
  }

  return (
    <div className="channel-card miniapp-card" style={{ '--channel-color': COLOR } as React.CSSProperties}>
      <div className="miniapp-qr" ref={qrRef}>
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
          <Button variant="primary" size="sm" fullWidth icon={<IconPrint />} onClick={printQr} disabled={!url}>
            {t('channels.miniapp.print')}
          </Button>
        </div>
      </div>
    </div>
  )
}
