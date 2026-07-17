import type { UserAccount, UserInfo } from './types';

export const initialAccounts: UserAccount[] = [
  { id: 1, name: 'Алексей Морозов',  email: 'admin@velora.studio',   role: 'Владелец (Основной)', active: true,  color: '#FCAE91' },
  { id: 2, name: 'Alexey Dev',        email: 'dev.morozov@gmail.com', role: 'Тестовый аккаунт',    active: false, color: '#9BB5D8' },
  { id: 3, name: 'Morozov Personal',  email: 'alexey@yandex.ru',      role: 'Личный профиль',       active: false, color: '#A3C9A8' },
];

export const emptyUserInfo: UserInfo = {
  name:  '',
  email: '',
  phone: '',
};
