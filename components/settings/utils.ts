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

/** True when ping reports DB + KV bindings present. */
export function isPingConnected(ping: Pick<PingResponse, "ok" | "bindings">): boolean {
  return ping.ok && !!ping.bindings?.db && !!ping.bindings?.kv;
}

/**
 * Optional setup hint after a successful connectivity check.
 * Returns null when the instance looks ready to use.
 */
export function pingSetupHint(
  ping: Pick<PingResponse, "dbReady" | "needsMigration" | "adminReady">,
): string | null {
  if (ping.needsMigration) {
    return "实例尚未完成数据库迁移，请先打开主站完成初始化";
  }
  if (ping.dbReady === false || ping.adminReady === false) {
    return "实例尚未完成初始化，请先打开主站创建管理员";
  }
  return null;
}
