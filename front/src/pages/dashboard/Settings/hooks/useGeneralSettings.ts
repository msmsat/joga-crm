import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { settingsApi } from "../../../../api/settings/settings.api";
import { studioApi } from "../../../../api/studio/studio.api";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import { useToast } from "../../../../components/ui/index";
import type { GeneralSettings, GeneralUpdate } from "../../../../api/settings/settings.types";

// Данные компании и локаль студии — общий кэш-ключ studioSettings: на нём же
// висит useStudioCurrency() во всём приложении (Каталог, Клиенты, Лояльность).
export function useGeneralSettings() {
  const qc = useQueryClient();
  const { t, i18n } = useTranslation("settings");
  const toast = useToast();

  const query = useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: () => settingsApi.getGeneral(),
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: (patch: GeneralUpdate) => settingsApi.updateGeneral(patch),
    onSuccess: (data, patch) => {
      qc.setQueryData(queryKeys.studioSettings, data);
      // Смена языка — сразу переключаем интерфейс, не дожидаясь перезахода.
      if (patch.language && patch.language !== i18n.language) {
        i18n.changeLanguage(patch.language);
      }
      toast.success(t("toast.saved"));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => studioApi.uploadStudioLogo(file),
    onSuccess: ({ logo_url }) => {
      qc.setQueryData<GeneralSettings>(queryKeys.studioSettings, (prev) =>
        prev ? { ...prev, logo_url } : prev
      );
      toast.success(t("toast.saved"));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return { ...query, save, uploadLogo };
}
