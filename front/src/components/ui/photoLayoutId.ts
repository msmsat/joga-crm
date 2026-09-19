/** id общего элемента: миниатюра с тем же id «разворачивается» в кадр Lightbox.
 *  Отдельный модуль, а не экспорт из Lightbox.tsx — иначе hot-reload теряет
 *  файл, где рядом с компонентом лежит функция (react-refresh). */
export const photoLayoutId = (src: string) => `v-photo-${src}`;
