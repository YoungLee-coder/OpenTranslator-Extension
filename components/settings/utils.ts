import type { PingResponse } from "@/types";

export function formatInstanceHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatBindings(bindings: PingResponse["bindings"]) {
  return `DB ${bindings.db ? "已绑定" : "未绑定"} · KV ${bindings.kv ? "已绑定" : "未绑定"}`;
}
