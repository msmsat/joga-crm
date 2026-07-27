import type { GeneralState, IntegrationsConfig, Session, Studio } from "./types";

export const DEFAULT_GENERAL: GeneralState = {
  name: "Pilates & Wellness Studio",
  desc: "",
  phone: "+7 (495) 000-00-00",
  email: "hello@studio.ru",
  site: "",
  address: "Москва, ул. Примерная, 1",
  logo: null,
};

export const INITIAL_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  whatsapp: { connected: true, phone: "+7 (900) 123-45-67", webhook: "https://api.velora.studio/v1/wa/webhook" },
  telegram: { connected: true, token: "123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ", welcomeMsg: "Приветствуем! Выберите удобное время для записи ✨" },
  instagram: { connected: false, account: "" },
  google: { connected: false, calendarName: "Основной календарь", syncType: "Двусторонняя" },
  onec: { connected: false, url: "https://1c.studio.ru/base", login: "" },
  yandex: { connected: true, shopId: "208492", testMode: false },
};

export const INITIAL_SESSIONS: Session[] = [
  { id: 1, device: "MacBook Pro 14\"", platform: null, browser: "Safari", location_city: "Москва", location_country: "РФ", last_active: new Date().toISOString(), is_current: true, icon: "laptop" },
  { id: 2, device: "iPhone 13 Pro", platform: null, browser: "App / iOS", location_city: "Санкт-Петербург", location_country: "РФ", last_active: new Date(Date.now() - 20 * 60 * 60_000).toISOString(), is_current: false, icon: "phone" },
];

export const INITIAL_STUDIOS_LIST: Studio[] = [
  { id: "1", name: "Pilates & Wellness Studio", theme: "light", desc: "Жемчужно-алебастровый UI · Основное пространство" },
  { id: "2", name: "Barbershop Blade & Co", theme: "dark", desc: "Матовый глубокий графит · Брутальный стиль" },
];
