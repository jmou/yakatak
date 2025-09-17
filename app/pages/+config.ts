import vikeVue from "vike-vue/config";
import type { Config } from "vike/types";

export default {
  title: "Yakatak",
  extends: vikeVue,
  prerender: false,
  ssr: false,
} satisfies Config;
