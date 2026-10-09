/**
 * Снимок к отзыву — ужатый до 1600px по длинной стороне JPEG.
 *
 * Кадр с камеры телефона весит 4–8 МБ: по мобильной сети это десятки секунд
 * под крутящимся превью и почти неизбежный отказ на лимите сервера. Для
 * карточки отзыва и просмотра в CRM 1600px с запасом.
 *
 * `imageOrientation: 'from-image'` — поворот из EXIF: без него вертикальные
 * кадры iPhone ложились бы набок. Что-то не вышло (старый браузер, HEIC,
 * который не декодируется) — уходит исходный файл: сервер всё равно проверит
 * размер и формат, а отказываться за него здесь незачем.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export async function shrinkImage(file: File): Promise<{ blob: Blob; name: string }> {
  const original = { blob: file as Blob, name: file.name || 'photo.jpg' };
  // Анимацию canvas убил бы, а маленький файл ужимать незачем.
  if (file.type === 'image/gif' || file.size < 400 * 1024 || typeof createImageBitmap !== 'function') {
    return original;
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return original;
    return { blob, name: `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg` };
  } catch {
    return original;
  }
}
