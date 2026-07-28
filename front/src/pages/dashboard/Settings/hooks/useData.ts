import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { settingsApi } from "../../../../api/settings/settings.api";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import { useToast } from "../../../../components/ui/index";
import type { DataExportKind } from "../../../../api/settings/settings.types";

export const EXPORT_KINDS: DataExportKind[] = ["clients", "schedule", "finances", "subscriptions"];

export function useData() {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportingKind, setExportingKind] = useState<DataExportKind | null>(null);

  const params = { date_from: dateFrom || undefined, date_to: dateTo || undefined };

  const estimateQueries = useQueries({
    queries: EXPORT_KINDS.map((kind) => ({
      queryKey: queryKeys.dataExportEstimate(kind, dateFrom, dateTo),
      queryFn: () => settingsApi.getExportEstimate(kind, params),
    })),
  });

  const estimates = Object.fromEntries(
    EXPORT_KINDS.map((kind, i) => [kind, estimateQueries[i]]),
  ) as Record<DataExportKind, (typeof estimateQueries)[number]>;

  const exportKind = async (kind: DataExportKind) => {
    setExportingKind(kind);
    try {
      await settingsApi.exportData(kind, params);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setExportingKind(null);
    }
  };

  return { dateFrom, setDateFrom, dateTo, setDateTo, estimates, exportingKind, exportKind };
}
