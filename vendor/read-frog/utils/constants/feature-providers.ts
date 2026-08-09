import type { Config } from "#rf/types/config/config"

export function resolveProviderConfig(_config: Config, _kind: "translate") {
  return {
    provider: "opentranslator",
    id: "opentranslator",
    baseURL: undefined as string | undefined,
  }
}
