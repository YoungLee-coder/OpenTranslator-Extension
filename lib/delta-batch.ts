/**
 * Coalesce high-frequency stream chunks.
 * The first chunk is flushed immediately (TTFT); later chunks batch into ~one frame.
 */
export function createDeltaBatcher(
  flush: (text: string) => void,
  intervalMs = 16,
): { push: (text: string) => void; drain: () => void; clear: () => void } {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  };

  const drain = () => {
    timer = null;
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    flush(text);
  };

  return {
    push(text: string) {
      if (!text) return;
      if (timer == null && !buffer) {
        flush(text);
        timer = setTimeout(drain, intervalMs);
        return;
      }
      buffer += text;
      if (timer == null) timer = setTimeout(drain, intervalMs);
    },
    drain() {
      stopTimer();
      if (!buffer) return;
      const text = buffer;
      buffer = "";
      flush(text);
    },
    /** Drop buffered text and the pending timer without flushing (abort / disconnect). */
    clear() {
      stopTimer();
      buffer = "";
    },
  };
}
