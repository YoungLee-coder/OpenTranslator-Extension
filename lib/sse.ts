import type { TranslateStreamEvent } from "@/types";

function nextFrameBreak(buffer: string): { index: number; width: number } | null {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  if (lf === -1 && crlf === -1) return null;
  if (crlf === -1) return { index: lf, width: 2 };
  if (lf === -1) return { index: crlf, width: 4 };
  return crlf < lf ? { index: crlf, width: 4 } : { index: lf, width: 2 };
}

function parseSseBlock(block: string): TranslateStreamEvent | null {
  const dataParts: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataParts.length === 0) return null;
  try {
    return JSON.parse(dataParts.join("\n")) as TranslateStreamEvent;
  } catch {
    return null;
  }
}

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
      if (done) {
        buffer += decoder.decode();
        const event = parseSseBlock(buffer);
        if (event) yield event;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let sep = nextFrameBreak(buffer);
      while (sep) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep.width);
        const event = parseSseBlock(block);
        if (event) yield event;
        sep = nextFrameBreak(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
