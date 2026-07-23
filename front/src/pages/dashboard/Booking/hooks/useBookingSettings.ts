import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bookingApi } from '../../../../api/booking/booking.api'
import type { BookingSettings } from '../../../../api/booking/booking.types'
import { queryKeys } from '../../../../api/queryKeys'
import { useToast } from '../../../../components/ui/Toast'
import { errorMessage } from '../../../../api/errorMessage'
import {
  advanceValue, windowValue, cancelValue, langValue, stepValue, colorIndex, WIDGET_COLORS,
} from '../mapping'

export function useBookingSettings() {
  const qc = useQueryClient()
  const { t } = useTranslation(['booking', 'common'])
  const toast = useToast()

  const { data: settings = null, error } = useQuery({
    queryKey: queryKeys.bookingSettings,
    queryFn: () => bookingApi.getSettings(),
  })

  const mutation = useMutation({
    mutationFn: (payload: Partial<BookingSettings>) => bookingApi.updateSettings(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: queryKeys.bookingSettings })
      const prev = qc.getQueryData<BookingSettings>(queryKeys.bookingSettings)
      if (prev) qc.setQueryData<BookingSettings>(queryKeys.bookingSettings, { ...prev, ...payload })
      return { prev }
    },
    onError: (err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.bookingSettings, ctx.prev)
      toast.error(errorMessage(err, t))
    },
    onSuccess: () => toast.success(t('common:buttons.saved')),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.bookingSettings }),
  })

  // Оптимистично: применяем локально, PATCH-им; при ошибке откатываем (в onError мутации).
  function patch<K extends keyof BookingSettings>(field: K, value: BookingSettings[K]) {
    mutation.mutate({ [field]: value } as Partial<BookingSettings>)
  }

  return { settings, error, patch, t,
    // Хелперы: ближайшее валидное value из списка опций для селектов.
    advanceValue, windowValue, cancelValue, langValue, stepValue, colorIndex, WIDGET_COLORS,
  }
}
