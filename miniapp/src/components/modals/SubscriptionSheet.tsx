import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Текст отказа от сервера — правила записи объясняет он, не мы. */
  message: string | null;
  /** Ведёт в покупку абонемента (вкладка профиля, BuyModal). */
  onBuy: () => void;
  /** Поверх листа брони: у расписания он второй, у главной — третий. */
  layer?: number;
}

/**
 * «Нужен абонемент» — ответ 402 при включённой «Предоплате при записи».
 *
 * Панель, а не тост: отказ без выхода — тупик, а купить абонемент можно тут же,
 * в этом же приложении. Тот же приём, что и с телефоном (428): сервер называет
 * недостающее предусловие, приложение открывает путь его закрыть.
 */
export default function SubscriptionSheet({ isOpen, onClose, message, onBuy, layer = 2 }: Props) {
  const { t } = useTranslation();

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      kicker={t('subscriptionSheet.kicker')}
      title={t('subscriptionSheet.title')}
      footer={
        <SheetAction onClick={onBuy}>{t('subscriptionSheet.buy')}</SheetAction>
      }
    >
      <div className="text-[13px] font-medium leading-relaxed text-muted-foreground">
        {message || t('subscriptionSheet.hint')}
      </div>
    </Sheet>
  );
}
