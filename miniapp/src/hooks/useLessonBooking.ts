import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bookLesson, cancelLesson } from '../api/user';
import type { CoffeeState, LessonResponse } from '../api/lessons';
import { useTelegram } from './useTelegram';
import { spawnPetals } from '../lib/petals';
import { notify } from '../lib/notify';
import { getSession } from '../lib/session';
import { bumpLessons } from '../lib/revision';
import type { ApiError } from '../api/client';
import { needsSubscription as subscriptionRequired } from '../lib/bookingFailure';

interface Options {
  prepayRequired?: boolean;
  /** Свои подписи страницы: у главной и расписания они разные. */
  messages: { bookError: string; cancelError: string; cancelSuccess: string };
  /**
   * Гость дошёл до брони: расписание он смотрел без аккаунта, а место студия
   * держит на конкретного человека. Поднимает существующий вход (App) и
   * повторяет ту же бронь после него — тем же приёмом, что и `retryAfterPhone`.
   */
  onNeedAuth?: (retry: () => void) => void;
  /** Бронь прошла — до листа успеха. Мастер записи с главной закрывает себя. */
  onBooked?: () => void;
}

/**
 * Запись на занятие и отмена своей брони — один сценарий на две страницы
 * (главная и расписание). Раньше он был дословной копией в обеих, и копии уже
 * начали расходиться текстами и порядком обновления.
 *
 * Два ответа сервера здесь не ошибки, а недостающие предусловия, и каждое
 * открывает свою панель вместо тоста:
 *   нет сессии — занятие выбирал гость → существующий вход (`onNeedAuth`),
 *         после него повторяем ту же бронь. Это единственное место, где
 *         регистрация обязательна: смотреть и выбирать можно без неё;
 *   428 — нет телефона (запись с оплатой на месте) → PhoneSheet, после
 *         сохранения повторяем ту же бронь: занятие и коврик остались в состоянии;
 *   NO_FUNDING и включённая предоплата → лист с текстом
 *         сервера и кнопкой в покупку. Тост тут был тупиком: человеку сообщали,
 *         что нужен абонемент, и не давали способа его купить.
 *
 * Об успешной записи и отмене хук объявляет сам — `bumpLessons()` вместо
 * колбэка страницы. Устаревают не «списки этой страницы», а данные о занятиях
 * вообще: бронь с главной меняет и расписание, и «мои занятия», а те со времён
 * постоянно смонтированных разделов сами о ней не узнают.
 */
export function useLessonBooking({ messages, onNeedAuth, onBooked, prepayRequired }: Options) {
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
  // Повтор после телефона — та самая попытка, а не «текущий лист»: мастер
  // записи держит занятие и коврик у себя, а не в этом хуке.
  const retry = useRef<(() => void) | null>(null);

  const openModal = (lesson: LessonResponse | null) => {
    setNeedsPhone(false);
    setNeedsSubscription(null);
    setSelectedSpot(null);
    setActiveLesson(lesson);
    setIsModalOpen(true);
    vibrateMedium();
  };

  const closeModal = () => setIsModalOpen(false);

  // Запись приложение не закрывает: человек остаётся на странице и уходит сам.
  // Раньше здесь стоял tg.close(), и он же был источником зависания — вне
  // Telegram метод ничего не делает, а ветка else не выполнялась никогда, потому
  // что telegram-web-app.js создавал window.Telegram.WebApp и в браузере тоже.
  const closeSuccess = () => {
    setIsSuccessOpen(false);
    // Кофе — только если студия его включила: иначе цепочка кончается успехом.
    if (coffee?.enabled) setIsCoffeeOpen(true);
  };

  /** Записать на занятие и коврик. Лист брони расписания зовёт её через `pay`,
   *  мастер записи с главной — напрямую, со своим занятием и ковриком. */
  const book = async (lesson: LessonResponse, spot: number) => {
    // Момент, ради которого регистрацию и отодвигали: до него занятие можно
    // было и посмотреть, и выбрать. Лист брони при этом не закрываем — занятие
    // и коврик обязаны дождаться человека с той стороны входа.
    if (!getSession() && onNeedAuth) {
      onNeedAuth(() => void book(lesson, spot));
      return;
    }

    retry.current = () => void book(lesson, spot);
    // Лист успеха и кофе называют занятие по нему.
    setActiveLesson(lesson);
    setIsProcessing(true);
    try {
      const reservation = await bookLesson({
        lesson_id: lesson.id,
        spot_number: spot,
      });

      setCoffee(reservation.coffee);
      bumpLessons();
      setIsProcessing(false);
      closeModal();
      onBooked?.();
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
      if (subscriptionRequired(error as ApiError, prepayRequired)) {
        setNeedsSubscription(
          error instanceof Error ? error.message : t('subscriptionSheet.hint'),
        );
        return;
      }
      const failure = error as ApiError;
      notify(failure.code
        ? t(`resource.errors.${failure.code}`, { defaultValue: failure.message || messages.bookError })
        : failure.message || messages.bookError);
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const pay = async () => {
    if (!activeLesson || !selectedSpot) return;
    await book(activeLesson, selectedSpot);
  };

  const cancel = async (lesson: LessonResponse) => {
    setIsProcessing(true);
    try {
      await cancelLesson(lesson.id);

      bumpLessons();
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

  const cancelBooking = async () => {
    if (!activeLesson) return;
    await cancel(activeLesson);
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
    book,
    cancelBooking,
    cancel,
    needsPhone,
    closePhone: () => setNeedsPhone(false),
    /** Номер сохранён — повторяем ту же бронь. */
    retryAfterPhone: () => {
      setNeedsPhone(false);
      retry.current?.();
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
