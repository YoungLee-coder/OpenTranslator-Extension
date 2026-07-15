import { defineConfig } from "wxt";

/** Fixed dev extension ID: gjmakoddcjjkfidekkkcmadihemhegfk — see docs/ORIGINS.md */
const DEV_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAze2swMhEmdbVnNQDBboKnkrAbk5eONXnmCCUL8Cn/CjpzGYcAAC2wXw0S1uAZCm2CXQANyWDXqNDl6m+uj465/9H8TNFPn8oN4mSaG5AuZYJvXgPJlUUnrFvkx96AaMzB+lyMoE3vVlqSI7W6wpPSr9SNeFzvn4ScpqzwtELxLcYvyUIjqP3X8O+LNQeXx+yxdWiQ25IgfBhcg45LeuCIraaT2Z+0rD+1NydRzHKpMKY9UIO9DipkcRoTSU9SbzcZaL/vCRhPBbjGBciRqZCHFQ83E6Ppt1gZo1Dgk0gUsqKxv5B9utXCl3zBJbtqpXQ2PG8fqGIjHKq4jul4xynMwIDAQAB";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "OpenTranslator",
    description: "使用自托管 OpenTranslator 实例进行翻译",
    key: DEV_EXTENSION_KEY,
    permissions: ["storage", "alarms"],
    host_permissions: ["http://localhost:8787/*"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    action: {
      default_title: "OpenTranslator",
    },
  },
});
