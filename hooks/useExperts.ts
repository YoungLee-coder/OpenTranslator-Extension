import { useCallback, useEffect, useState } from "react";
import { GENERAL_EXPERT_ID } from "@/lib/experts";
import { sendBg } from "@/lib/messaging";
import type { ExtensionState } from "@/lib/messaging";
import type { AiExpertMeta, AiExpertsPublicResponse } from "@/types";

type UseExpertsOptions = {
  enabled: boolean;
  userId?: string;
  onPrefsAdjusted?: () => void | Promise<unknown>;
};

export function useExperts({ enabled, userId, onPrefsAdjusted }: UseExpertsOptions) {
  const [experts, setExperts] = useState<AiExpertMeta[]>([]);
  const [defaultExpertId, setDefaultExpertId] = useState(GENERAL_EXPERT_ID);

  const reload = useCallback(async () => {
    const res = await sendBg<AiExpertsPublicResponse>({ type: "getExperts" });
    if (!res.ok || !res.data) {
      setExperts([]);
      setDefaultExpertId(GENERAL_EXPERT_ID);
      return;
    }

    const list = res.data.experts;
    const nextDefault = res.data.defaultExpertId ?? GENERAL_EXPERT_ID;
    setExperts(list);
    setDefaultExpertId(nextDefault);

    if (list.length === 0) {
      const current = await sendBg<ExtensionState>({ type: "getState" });
      if (current.data?.expertId && current.data.expertId !== GENERAL_EXPERT_ID) {
        await sendBg<ExtensionState>({ type: "setPrefs", expertId: GENERAL_EXPERT_ID });
        await onPrefsAdjusted?.();
      }
      return;
    }

    const current = await sendBg<ExtensionState>({ type: "getState" });
    const stored = current.data?.expertId ?? GENERAL_EXPERT_ID;
    const validIds = new Set(list.map((item) => item.id));
    if (stored !== GENERAL_EXPERT_ID && !validIds.has(stored)) {
      await sendBg<ExtensionState>({ type: "setPrefs", expertId: nextDefault });
      await onPrefsAdjusted?.();
    }
  }, [onPrefsAdjusted]);

  useEffect(() => {
    if (!enabled) {
      setExperts([]);
      setDefaultExpertId(GENERAL_EXPERT_ID);
      return;
    }
    void reload();
  }, [enabled, userId, reload]);

  return { experts, defaultExpertId };
}
