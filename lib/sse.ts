import type { TranslateStreamEvent } from "@/types";

/** Parse SSE frames from a fetch ReadableStream body. */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<TranslateStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataParts: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) {
            dataParts.push(line.slice(5).replace(/^ /, ""));
          }
        }
        if (dataParts.length === 0) continue;
        const json = dataParts.join("\n");
        try {
          yield JSON.parse(json) as TranslateStreamEvent;
        } catch {
          // skip malformed keepalives
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
