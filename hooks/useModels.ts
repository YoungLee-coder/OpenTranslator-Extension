import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/errors";
import { sendBg } from "@/lib/messaging";
import type { TranslateModelOption, TranslateModelsResponse } from "@/types";

type UseModelsOptions = {
  /** When false, skip fetching and clear model list. */
  enabled: boolean;
  /** Refetch when the signed-in user changes. */
  userId?: string;
};

export function useModels({ enabled, userId }: UseModelsOptions) {
  const [models, setModels] = useState<TranslateModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await sendBg<TranslateModelsResponse>({ type: "getModels" });
      if (!res.ok) {
        setModels([]);
        setError(formatApiError(res.error, res.status, res.kind));
        return res;
      }
      setModels(res.data?.models ?? []);
      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      setError("");
      return;
    }
    void reload();
  }, [enabled, userId, reload]);

  return { models, loading, error, reload };
}
