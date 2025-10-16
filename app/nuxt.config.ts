// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/eslint", "@pinia/nuxt"],
  app: {
    head: { title: "Yakatak" },
  },
  runtimeConfig: {
    dbPath: `${process.cwd()}/../state/db.sqlite3`,
  },
  ssr: false,
  typescript: {
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        erasableSyntaxOnly: true,
        noUncheckedIndexedAccess: true,
      },
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          erasableSyntaxOnly: true,
          noUncheckedIndexedAccess: true,
        },
      },
    },
  },
});
