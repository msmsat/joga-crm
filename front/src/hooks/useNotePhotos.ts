import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { studioApi } from '../api/studio/studio.api';
import { errorMessage } from '../api/errorMessage';
import { useToast } from '../components/ui/Toast';

/**
 * Снимки в черновике заметки — о клиенте или о занятии.
 *
 * Файл уходит на сервер сразу, форма держит уже сохранённую ссылку: заметку
 * правят и после сохранения, и черновик до него должен показывать снимки.
 * Пока файл летит, в строке стоит локальное превью — иначе выбор файла минуту
 * выглядит так, будто ничего не произошло.
 */
export function useNotePhotos(initial: string[] = []) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const [photos, setPhotos] = useState<string[]>(initial);
  // blob-превью незавершённых загрузок. Живут до ответа сервера и
  // освобождаются в done() — иначе вкладка копит их до перезагрузки.
  const [pending, setPending] = useState<string[]>([]);

  const add = useCallback((files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;

    const previews = list.map(f => URL.createObjectURL(f));
    setPending(prev => [...prev, ...previews]);

    list.forEach((file, i) => {
      studioApi.uploadNotePhoto(file)
        .then(r => setPhotos(prev => [...prev, r.url]))
        .catch((e: Error) => toast.error(errorMessage(e, t)))
        .finally(() => {
          URL.revokeObjectURL(previews[i]);
          setPending(prev => prev.filter(p => p !== previews[i]));
        });
    });
  }, [toast, t]);

  const remove = useCallback((url: string) => {
    setPhotos(prev => prev.filter(p => p !== url));
  }, []);

  const reset = useCallback((next: string[] = []) => setPhotos(next), []);

  return { photos, pending, add, remove, reset };
}
