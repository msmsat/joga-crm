/** Only URLs issued by our API; never arbitrary remote URLs or token queries. */
export const privateMediaPath = (path: string) => /^\/clients\/[1-9][0-9]*\/media\/[1-9][0-9]*$/.test(path);
export const publicNotePath = (path: string) => /^\/static\/notes\/[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif)$/.test(path);
/** Снимки к отзыву клиента о занятии — их выдаёт загрузка мини-приложения. */
export const publicReviewPath = (path: string) => /^\/static\/reviews\/[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif)$/.test(path);
export const ownedMediaPath = (path: string) => privateMediaPath(path) || publicNotePath(path) || publicReviewPath(path);
