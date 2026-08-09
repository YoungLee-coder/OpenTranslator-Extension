import type {
  AiExpertsPublicResponse,
  AuthMeResponse,
  AuthSessionResponse,
  LoginRequest,
  PingResponse,
  TranslateEmailRequest,
  TranslateModelsResponse,
  TranslateRequest,
  TranslateStreamEvent,
} from "@/types";
import { parseSseStream } from "@/lib/sse";

export class ApiError extends Error {
  status: number;
  kind: "cors" | "network" | "api";
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

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return {};
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

function wrapFetchError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
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

export async function ping(baseUrl: string): Promise<PingResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/ping`);
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return res.json() as Promise<PingResponse>;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function login(
  baseUrl: string,
  body: LoginRequest,
): Promise<AuthSessionResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    return res.json() as Promise<AuthSessionResponse>;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function me(
  baseUrl: string,
  token: string,
): Promise<AuthMeResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return res.json() as Promise<AuthMeResponse>;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function fetchExperts(
  baseUrl: string,
  token: string,
): Promise<AiExpertsPublicResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/translate/experts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return res.json() as Promise<AiExpertsPublicResponse>;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function fetchModels(
  baseUrl: string,
  token: string,
): Promise<TranslateModelsResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/translate/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, await readErrorMessage(res));
    }
    return res.json() as Promise<TranslateModelsResponse>;
  } catch (err) {
    throw wrapFetchError(err);
  }
}

export async function logout(baseUrl: string, token: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...req, stream: true }),
      signal,
    });
  } catch (err) {
    throw wrapFetchError(err);
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

  yield* parseSseStream(res.body, signal);
}

/** POST /api/translate/email — layout-preserving whole-email HTML translation. */
export async function* streamTranslateEmail(
  baseUrl: string,
  token: string,
  req: TranslateEmailRequest,
  signal?: AbortSignal,
): AsyncGenerator<TranslateStreamEvent> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/translate/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...req,
        stream: true,
        preserveQuotes: req.preserveQuotes !== false,
        display: req.display === "bilingual" ? "bilingual" : "replace",
      }),
      signal,
    });
  } catch (err) {
    throw wrapFetchError(err);
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

  yield* parseSseStream(res.body, signal);
}
