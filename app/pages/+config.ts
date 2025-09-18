import vikeVue from "vike-vue/config";
import vikeVuePinia from "vike-vue-pinia/config";
import type { Config } from "vike/types";

export default {
  title: "Yakatak",
  extends: [vikeVue, vikeVuePinia],
  prerender: false,
  ssr: false,
} satisfies Config;
