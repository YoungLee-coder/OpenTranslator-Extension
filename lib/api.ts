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
import { parseSseStream } from "@/lib/sse";

export class ApiError extends Error {
  status: number;
  kind: "cors" | "network" | "api";

  constructor(status: number, message: string, kind: ApiError["kind"] = "api") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return `请求失败 (${res.status})`;
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
    const msg =
      res.status === 429
        ? "请求过于频繁，请稍后再试"
        : await readErrorMessage(res);
    throw new ApiError(res.status, msg);
  }

  yield* parseSseStream(res.body, signal);
}
