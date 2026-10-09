import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import * as Icons from '../../../../../components/Icons'
import { Button, CopyLink, QrShareModal } from '../../../../../components/ui/index'
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
 * Адрес в карточке — то же поле CopyLink, что в модалке: нажал — скопировано.
 */
export function MiniappCard({ url }: { url: string }) {
  const { t } = useTranslation('booking')
  const { data: studio } = useStudioSettings()
  const [isQrOpen, setIsQrOpen] = useState(false)

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

        <CopyLink value={url} size="sm" openLabel={t('channels.miniapp.open')} />

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
