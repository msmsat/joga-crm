import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bookLesson, cancelLesson } from '../api/user';
import type { CoffeeState, LessonResponse } from '../api/lessons';
import { useTelegram } from './useTelegram';
import { spawnPetals } from '../lib/petals';
import { notify } from '../lib/notify';

interface Options {
  /** Списки этой страницы устарели — перечитать (главная тянет ещё и «ближайшее»). */
  onChanged: () => void;
  /** Свои подписи страницы: у главной и расписания они разные. */
  messages: { bookError: string; cancelError: string; cancelSuccess: string };
}

/**
 * Запись на занятие и отмена своей брони — один сценарий на две страницы
 * (главная и расписание). Раньше он был дословной копией в обеих, и копии уже
 * начали расходиться текстами и порядком обновления.
 *
 * Два ответа сервера здесь не ошибки, а недостающие предусловия, и каждое
 * открывает свою панель вместо тоста:
 *   428 — нет телефона (запись с оплатой на месте) → PhoneSheet, после
 *         сохранения повторяем ту же бронь: занятие и коврик остались в состоянии;
 *   402 — студия требует абонемент («Предоплата при записи») → лист с текстом
 *         сервера и кнопкой в покупку. Тост тут был тупиком: человеку сообщали,
 *         что нужен абонемент, и не давали способа его купить.
 */
export function useLessonBooking({ onChanged, messages }: Options) {
  const { t } = useTranslation();
  const { tg, vibrateMedium } = useTelegram();

  const [activeLesson, setActiveLesson] = useState<LessonResponse | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  // Текст отказа от сервера: своей формулировки у листа нет — правила записи
  // живут на бэкенде, и объяснять их двумя сводами мы не будем.
  const [needsSubscription, setNeedsSubscription] = useState<string | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  // Кофе спрашиваем последней панелью — после того, как человек закрыл успех.
  // Состояние берём из ответа на бронь, а не из карточки занятия: там снимок
  // сделан ДО записи, и счётчик успевал устареть.
  const [isCoffeeOpen, setIsCoffeeOpen] = useState(false);
  const [coffee, setCoffee] = useState<CoffeeState | null>(null);

  const openModal = (lesson: LessonResponse | null) => {
    setSelectedSpot(null);
    setActiveLesson(lesson);
    setIsModalOpen(true);
    vibrateMedium();
  };

  const closeModal = () => setIsModalOpen(false);

  // Запись приложение не закрывает: человек остаётся на странице и уходит сам.
  // Раньше здесь стоял tg.close(), и он же был источником зависания — вне
  // Telegram метод ничего не делает, а ветка else не выполнялась никогда, потому
  // что telegram-web-app.js создаёт window.Telegram.WebApp и в браузере тоже.
  const closeSuccess = () => {
    setIsSuccessOpen(false);
    // Кофе — только если студия его включила: иначе цепочка кончается успехом.
    if (coffee?.enabled) setIsCoffeeOpen(true);
  };

  const pay = async () => {
    if (!activeLesson || !selectedSpot) return;

    setIsProcessing(true);
    try {
      const reservation = await bookLesson({
        lesson_id: activeLesson.id,
        spot_number: selectedSpot,
      });

      setCoffee(reservation.coffee);
      onChanged();
      setIsProcessing(false);
      closeModal();
      setIsSuccessOpen(true);
      spawnPetals();

      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      const status = (error as { status?: number }).status;
      if (status === 428) {
        setNeedsPhone(true);
        return;
      }
      if (status === 402) {
        setNeedsSubscription(
          error instanceof Error ? error.message : t('subscriptionSheet.hint'),
        );
        return;
      }
      notify(error instanceof Error ? error.message : messages.bookError);
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);
    try {
      await cancelLesson(activeLesson.id);

      onChanged();
      setIsProcessing(false);
      closeModal();
      notify(messages.cancelSuccess);
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      // Правила отмены (за сколько ещё можно) живут на сервере — его текстом и
      // объясняем отказ, вместо своей догадки.
      notify(error instanceof Error ? error.message : messages.cancelError);
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  return {
    activeLesson,
    selectedSpot,
    setSelectedSpot,
    isModalOpen,
    openModal,
    closeModal,
    isProcessing,
    pay,
    cancelBooking,
    needsPhone,
    closePhone: () => setNeedsPhone(false),
    /** Номер сохранён — повторяем ту же бронь. */
    retryAfterPhone: () => {
      setNeedsPhone(false);
      void pay();
    },
    needsSubscription,
    closeSubscription: () => setNeedsSubscription(null),
    isSuccessOpen,
    closeSuccess,
    isCoffeeOpen,
    closeCoffee: () => setIsCoffeeOpen(false),
    coffee,
  };
}
