import { defineConfig } from "wxt";

/** Fixed dev extension ID: gjmakoddcjjkfidekkkcmadihemhegfk — see docs/ORIGINS.md */
const DEV_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAze2swMhEmdbVnNQDBboKnkrAbk5eONXnmCCUL8Cn/CjpzGYcAAC2wXw0S1uAZCm2CXQANyWDXqNDl6m+uj465/9H8TNFPn8oN4mSaG5AuZYJvXgPJlUUnrFvkx96AaMzB+lyMoE3vVlqSI7W6wpPSr9SNeFzvn4ScpqzwtELxLcYvyUIjqP3X8O+LNQeXx+yxdWiQ25IgfBhcg45LeuCIraaT2Z+0rD+1NydRzHKpMKY9UIO9DipkcRoTSU9SbzcZaL/vCRhPBbjGBciRqZCHFQ83E6Ppt1gZo1Dgk0gUsqKxv5B9utXCl3zBJbtqpXQ2PG8fqGIjHKq4jul4xynMwIDAQAB";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Chrome rejects extension modulepreload (cross-world mismatch); shared chunks still load via import.
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: {
    name: "OpenTranslator",
    description: "在侧边栏中使用自托管 OpenTranslator 实例翻译文本",
    homepage_url: "https://github.com/opentranslator/opentranslator",
    minimum_chrome_version: "116",
    key: DEV_EXTENSION_KEY,
    permissions: ["storage", "alarms"],
    host_permissions: ["http://localhost:8787/*"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    action: {
      default_title: "OpenTranslator",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
  },
});
