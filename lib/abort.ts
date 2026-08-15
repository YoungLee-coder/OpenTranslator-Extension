/** Abort / timeout helpers for fetch, streams, and MV3 cancellation. */

export function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export function isTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "TimeoutError") return true;
  return e.name === "AbortError" && /timeout|timed out/i.test(e.message ?? "");
}

export function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter(Boolean);
  if (active.length === 0) return new AbortController().signal;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        if (!controller.signal.aborted) controller.abort(signal.reason);
      },
      { once: true },
    );
  }
  return controller.signal;
}

function timeoutReason(): unknown {
  if (typeof DOMException === "function") {
    try {
      return new DOMException("The operation timed out.", "TimeoutError");
    } catch {
      // some runtimes reject the TimeoutError name
    }
  }
  return Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
}

/**
 * AbortController that follows an optional parent signal.
 * Use for streaming fetch: a connect timeout can abort the controller,
 * then be cleared so the body is not killed when headers have arrived.
 */
export function followAbortSignal(parent?: AbortSignal): {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
  dispose: () => void;
} {
  const controller = new AbortController();
  const onParentAbort = () => {
    if (!controller.signal.aborted) controller.abort(parent?.reason);
  };
  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener("abort", onParentAbort);
  }
  return {
    signal: controller.signal,
    abort: (reason) => {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    dispose: () => parent?.removeEventListener("abort", onParentAbort),
  };
}

export function startAbortTimeout(
  abort: (reason?: unknown) => void,
  timeoutMs: number,
): () => void {
  const timer = setTimeout(() => abort(timeoutReason()), timeoutMs);
  return () => clearTimeout(timer);
}
