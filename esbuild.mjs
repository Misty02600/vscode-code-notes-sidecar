import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const builds = [
  {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    mainFields: ["module", "main"],
    target: "node20",
    outfile: "dist/extension.js",
    minify: production,
    sourcemap: !production,
    logLevel: "info"
  },
  {
    entryPoints: ["src/webview/main.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: "media/preview.js",
    minify: production,
    sourcemap: !production,
    logLevel: "info"
  }
];

if (watch) {
  const contexts = await Promise.all(builds.map(options => esbuild.context(options)));
  await Promise.all(contexts.map(context => context.watch()));
} else {
  await Promise.all(builds.map(options => esbuild.build(options)));
}
