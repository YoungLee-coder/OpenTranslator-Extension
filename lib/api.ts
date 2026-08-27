import type {
  AiExpertsPublicResponse,
  AuthMeResponse,
  AuthSessionResponse,
  LoginRequest,
  PingResponse,
  TranslateModelsResponse,
  TranslateRequest,
  TranslateStreamEvent,
} from "@/types";
import {
  followAbortSignal,
  isAbortError,
  isTimeoutError,
  startAbortTimeout,
} from "@/lib/abort";
import { parseSseStream } from "@/lib/sse";

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
export const TRANSLATE_CONNECT_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  status: number;
  kind: "cors" | "network" | "api" | "timeout";
  retryAfterSeconds?: number;

  constructor(
    status: number,
    message: string,
    kind: ApiError["kind"] = "api",
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type ErrorBody = { error?: string; retryAfterSeconds?: number };

type ApiFetchInit = RequestInit & { timeoutMs?: number };

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return {};
  }
}

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status || 0, "实例返回了无法解析的响应");
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  const data = await readErrorBody(res);
  if (res.status === 429) {
    return formatRateLimitMessage(data.retryAfterSeconds);
  }
  if (data.error) {
    if (res.status === 400 && /exceeds maximum length|maximum length/i.test(data.error)) {
      return "原文过长，请缩短后再试（上限 80 000 字符）";
    }
    return data.error;
  }
  return `请求失败 (${res.status})`;
}

function formatRateLimitMessage(retryAfterSeconds?: number): string {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return `请求过于频繁，请 ${retryAfterSeconds} 秒后再试`;
  }
  return "请求过于频繁，请稍后再试";
}

export function wrapFetchError(err: unknown, signal?: AbortSignal): ApiError {
  if (err instanceof ApiError) return err;
  if (isTimeoutError(err) || isTimeoutError(signal?.reason)) {
    return new ApiError(0, "请求超时，请稍后重试", "timeout");
  }
  if (isAbortError(err) || isAbortError(signal?.reason)) {
    throw err;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return new ApiError(
      0,
      "无法连接实例，请检查网址、HTTPS 及实例是否在线；若为 CORS 错误，管理员需在 Worker ORIGINS 中加入本扩展 ID",
      "cors",
    );
  }
  return new ApiError(0, message, "network");
}

async function apiFetch(url: string, init: ApiFetchInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: userSignal, ...rest } = init;
  const parent = userSignal ?? undefined;
  const linked = followAbortSignal(parent);
  const clearTimeoutAbort = startAbortTimeout(linked.abort, timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: linked.signal });
  } catch (err) {
    if (linked.signal.aborted && !parent?.aborted) {
      throw new ApiError(0, "请求超时，请稍后重试", "timeout");
    }
    throw wrapFetchError(err, linked.signal);
  } finally {
    clearTimeoutAbort();
    linked.dispose();
  }
}

export async function ping(baseUrl: string, signal?: AbortSignal): Promise<PingResponse> {
  try {
    const res = await apiFetch(`${baseUrl}/api/ping`, { signal });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return readJson<PingResponse>(res);
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function login(
  baseUrl: string,
  body: LoginRequest,
  signal?: AbortSignal,
): Promise<AuthSessionResponse> {
  try {
    const res = await apiFetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      if (res.status === 401) {
        throw new ApiError(401, "邮箱或密码错误");
      }
      if (res.status === 403 && /private/i.test(msg)) {
        throw new ApiError(403, "站点为私有模式，请先登录");
      }
      throw new ApiError(res.status, msg);
    }
    const data = await readJson<AuthSessionResponse>(res);
    if (!data?.token || !data.user?.id) {
      throw new ApiError(0, "登录响应无效");
    }
    return data;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function me(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<AuthMeResponse> {
  try {
    const res = await apiFetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return readJson<AuthMeResponse>(res);
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function fetchExperts(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<AiExpertsPublicResponse> {
  try {
    const res = await apiFetch(`${baseUrl}/api/translate/experts`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return readJson<AiExpertsPublicResponse>(res);
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function fetchModels(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<TranslateModelsResponse> {
  try {
    const res = await apiFetch(`${baseUrl}/api/translate/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return readJson<TranslateModelsResponse>(res);
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function logout(baseUrl: string, token: string, signal?: AbortSignal): Promise<void> {
  try {
    const res = await apiFetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok && res.status !== 401) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function* streamTranslate(
  baseUrl: string,
  token: string,
  req: TranslateRequest,
  signal?: AbortSignal,
): AsyncGenerator<TranslateStreamEvent> {
  const linked = followAbortSignal(signal);
  const clearConnectTimeout = startAbortTimeout((reason) => {
    linked.abort(reason);
  }, TRANSLATE_CONNECT_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...req, stream: true }),
        signal: linked.signal,
        priority: "high",
      });
    } catch (err) {
      if (linked.signal.aborted && !signal?.aborted) {
        throw new ApiError(0, "请求超时，请稍后重试", "timeout");
      }
      throw wrapFetchError(err, linked.signal);
    } finally {
      clearConnectTimeout();
    }

    if (!res.ok || !res.body) {
      if (res.status === 429) {
        const body = await readErrorBody(res);
        throw new ApiError(
          429,
          formatRateLimitMessage(body.retryAfterSeconds),
          "api",
          body.retryAfterSeconds,
        );
      }
      throw new ApiError(res.status, await readErrorMessage(res));
    }

    yield* parseSseStream(res.body, linked.signal);
  } finally {
    linked.dispose();
  }
}
