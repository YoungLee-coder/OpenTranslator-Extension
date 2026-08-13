/**
 * Coalesce high-frequency stream chunks.
 * The first chunk is flushed immediately (TTFT); later chunks batch into ~one frame.
 */
export function createDeltaBatcher(
  flush: (text: string) => void,
  intervalMs = 16,
): { push: (text: string) => void; drain: () => void } {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

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
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!buffer) return;
      const text = buffer;
      buffer = "";
      flush(text);
    },
  };
}
