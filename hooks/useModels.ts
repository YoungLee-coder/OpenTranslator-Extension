import { useCallback, useEffect, useRef, useState } from "react";
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
  const generationRef = useRef(0);
  const onPrefsAdjustedRef = useRef(onPrefsAdjusted);
  onPrefsAdjustedRef.current = onPrefsAdjusted;

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await sendBg<TranslateModelsResponse>({ type: "getModels" });
      if (generation !== generationRef.current) return res;

      if (!res.ok) {
        setModels([]);
        setError(formatApiError(res.error, res.status, res.kind));
        if (res.status === 401 || res.status === 403) {
          await onPrefsAdjustedRef.current?.();
        }
        return res;
      }

      const list = res.data?.models ?? [];
      setModels(list);

      const defaultKey = res.data?.default
        ? `${res.data.default.providerId}|${res.data.default.model}`
        : null;

      if (list.length === 0) {
        const current = await sendBg<ExtensionState>({ type: "getState" });
        if (generation !== generationRef.current) return res;
        if (current.data?.modelKey) {
          await sendBg<ExtensionState>({ type: "setPrefs", modelKey: null });
          await onPrefsAdjustedRef.current?.();
        }
        return res;
      }

      const validKeys = new Set(list.map((option) => encodeModelKey(option)));
      const current = await sendBg<ExtensionState>({ type: "getState" });
      if (generation !== generationRef.current) return res;
      const stored = current.data?.modelKey;
      if (stored && !validKeys.has(stored)) {
        await sendBg<ExtensionState>({ type: "setPrefs", modelKey: defaultKey });
        await onPrefsAdjustedRef.current?.();
      }

      return res;
    } catch (err) {
      if (generation !== generationRef.current) return { ok: false as const, error: "" };
      setModels([]);
      setError(formatApiError(err instanceof Error ? err.message : String(err)));
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      setModels([]);
      setError("");
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, userId, reload]);

  return { models, loading, error, reload };
}
