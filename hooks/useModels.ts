import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/errors";
import { encodeModelKey } from "@/lib/models";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState } from "@/lib/messaging";
import type { TranslateModelOption, TranslateModelsResponse } from "@/types";

type UseModelsOptions = {
  /** When false, skip fetching and clear model list. */
  enabled: boolean;
  /** Refetch when the signed-in user changes. */
  userId?: string;
  onPrefsAdjusted?: () => void | Promise<unknown>;
};

export function useModels({ enabled, userId, onPrefsAdjusted }: UseModelsOptions) {
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

      const list = res.data?.models ?? [];
      setModels(list);

      const defaultKey = res.data?.default
        ? `${res.data.default.providerId}|${res.data.default.model}`
        : null;

      if (list.length === 0) {
        const current = await sendBg<ExtensionState>({ type: "getState" });
        if (current.data?.modelKey) {
          await sendBg<ExtensionState>({ type: "setPrefs", modelKey: null });
          await onPrefsAdjusted?.();
        }
        return res;
      }

      const validKeys = new Set(list.map((option) => encodeModelKey(option)));
      const current = await sendBg<ExtensionState>({ type: "getState" });
      const stored = current.data?.modelKey;
      if (stored && !validKeys.has(stored)) {
        await sendBg<ExtensionState>({ type: "setPrefs", modelKey: defaultKey });
        await onPrefsAdjusted?.();
      }

      return res;
    } finally {
      setLoading(false);
    }
  }, [onPrefsAdjusted]);

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
