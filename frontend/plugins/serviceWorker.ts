import { build, type Plugin, type Rollup } from "vite";
import { buildId, precacheUrls } from "./precache.ts";

/**
 * Bundles `src/sw/sw.ts` into an unhashed `/sw.js` at the root of the build output and
 * injects the precache list and a build id, so the worker's bytes change with every release
 * (that is what makes browsers install the update). Build only; there is no worker in dev.
 */
export function serviceWorker(options: { version: string }): Plugin {
  return {
    name: "cociboard-service-worker",
    apply: "build",
    async generateBundle(_output, bundle) {
      const urls = precacheUrls(Object.keys(bundle));
      const html = bundle["index.html"];
      const indexHtml = html && html.type === "asset" ? String(html.source) : "";
      const id = buildId(options.version, urls, indexHtml);
      const result = await build({
        configFile: false,
        publicDir: false,
        logLevel: "warn",
        define: { __PRECACHE_ASSETS__: JSON.stringify(urls), __BUILD_ID__: JSON.stringify(id) },
        build: {
          write: false,
          minify: true,
          lib: { entry: "src/sw/sw.ts", name: "cociboardServiceWorker", formats: ["iife"], fileName: () => "sw.js" },
        },
      });
      const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
      const chunk = outputs[0]?.output.find((item) => item.type === "chunk");
      if (!chunk) throw new Error("The service worker bundle produced no output");
      this.emitFile({ type: "asset", fileName: "sw.js", source: chunk.code });
    },
  };
}
