import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Yakatak",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://yakatak.app/*"],
  },
  modules: ["@wxt-dev/module-vue"],
  webExt: {
    chromiumArgs: ["--user-data-dir=.wxt/chrome-profile"],
  },
});
