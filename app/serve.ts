import { createHandler } from "@universal-middleware/fastify";
import Fastify from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDevMiddleware } from "vike";
import { apiHandler } from "./server/api-handler.ts";
import { vikeHandler } from "./server/vike-handler.ts";

const root = dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify();

  // Avoid pre-parsing body, otherwise it will cause issue with universal handlers
  // This will probably change in the future though, you can follow https://github.com/magne4000/universal-middleware for updates
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, _payload, done) => {
    done(null, "");
  });

  await app.register(await import("@fastify/middie"));

  if (process.env.NODE_ENV === "production") {
    await app.register(await import("@fastify/static"), {
      root: `${root}/dist/client`,
      wildcard: false,
    });
  } else {
    const port = parseInt(process.env.HMR_PORT ?? "24678");
    const viteConfig = { server: { hmr: { port } } };
    const { devMiddleware } = await createDevMiddleware({ root, viteConfig });
    app.use(devMiddleware);
  }

  app.all("/api/*", createHandler(apiHandler)());
  app.all("/*", createHandler(vikeHandler)());

  app.listen({ port: parseInt(process.env.PORT ?? "3000") }, (_err, address) => {
    console.log(`Server listening on ${address}`);
  });
}

await main();
