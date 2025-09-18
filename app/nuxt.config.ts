// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/eslint", "@pinia/nuxt"],
  app: {
    head: { title: "Yakatak" },
  },
  runtimeConfig: {
    stateDir: `${process.cwd()}/../state`,
  },
  ssr: false,
  typescript: {
    tsConfig: {
      compilerOptions: {
        erasableSyntaxOnly: true,
      },
    },
  },
});
