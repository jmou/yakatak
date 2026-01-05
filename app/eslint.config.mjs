// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import tseslint from "typescript-eslint";

export default withNuxt(
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "vue/html-self-closing": [
        "error",
        {
          html: {
            normal: "never",
            void: "always",
          },
        },
      ],
      "@typescript-eslint/strict-boolean-expressions": "error",
    },
  }
);
