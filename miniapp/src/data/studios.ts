export type Studio = {
  id: number;
  name: string;
  city: string;
  address: string;
  /** Может отсутствовать — карточка тогда собирается из названия и адреса. */
  photo?: string;
  /** Цвет фонового свечения страницы, когда студия выбрана. */
  tint: string;
  hours: string;
  isOpen: boolean;
};

/**
 * ponytail: временный список студий. Публичного эндпоинта «студии клиента»
 * в CRM ещё нет — есть только `/public/{studio_id}/…`, то есть студию надо
 * уже знать. Заменяется на реальный запрос, когда появится мультистудийность.
 *
 * Две студии намеренно без фото — так видно оба состояния карточки сразу.
 */
export const STUDIOS: Studio[] = [
  {
    id: 1,
    name: 'Namaste',
    city: 'Одеса',
    address: 'вул. Дерибасівська, 12',
    photo: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&q=80',
    tint: '#C9A227',
    hours: '08:00 — 22:00',
    isOpen: true,
  },
  {
    id: 2,
    name: 'Flow Studio',
    city: 'Київ',
    address: 'вул. Хрещатик, 44',
    photo: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80',
    tint: '#7D6E8C',
    hours: '07:00 — 23:00',
    isOpen: true,
  },
  {
    id: 3,
    name: 'Reforma',
    city: 'Львів',
    address: 'пл. Ринок, 8',
    tint: '#A8745A',
    hours: '09:00 — 21:00',
    isOpen: true,
  },
  {
    id: 4,
    name: 'Balance Lab',
    city: 'Прага',
    address: 'Vinohradská 112',
    tint: '#5E7A6B',
    hours: '10:00 — 20:00',
    isOpen: false,
  },
];
