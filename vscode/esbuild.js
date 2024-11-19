const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");
const fs = require("fs");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const metafile = process.argv.includes("--metafile");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

const tailwindPlugin = {
  name: "tailwind",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, "utf8");
      const result = await postcss([
        tailwindcss({
          config: "./webview/tailwind.config.js",
          content: ["./webview/src/**/*.{html,js,jsx,ts,tsx}"],
        }),
      ]).process(css, { from: args.path });
      return {
        contents: result.css,
        loader: "css",
      };
    });
  },
};

const metafilePlugin = {
  name: "metafile",
  setup(build) {
    const outfile = build.initialOptions.outfile;
    const bundleName = outfile.replace(/.*\/([^/]+)\.js$/, "$1");

    build.onEnd((result) => {
      if (result.metafile) {
        console.log(`meta.${bundleName}.json`);
        fs.writeFileSync(
          `${bundleName}.esbuild-meta.json`,
          JSON.stringify(result.metafile),
        );
      }
    });
  },
};

async function main() {
  const buildmap = {
    extension: esbuild.context({
      entryPoints: ["src/extension.ts"],
      bundle: true,
      format: "cjs",
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: "node",
      outfile: "dist/extension.js",
      external: ["vscode"],
      logLevel: "silent",
      metafile: metafile,
      plugins: [metafilePlugin, esbuildProblemMatcherPlugin],
    }),
    webview: esbuild.context({
      entryPoints: ["webview/src/main.tsx"],
      bundle: true,
      format: "esm",
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      tsconfig: "webview/tsconfig.json",
      outfile: "dist/webview/main.js",
      external: ["vscode", "vscode-webview"],
      logLevel: "silent",
      metafile: metafile,
      plugins: [tailwindPlugin, metafilePlugin, esbuildProblemMatcherPlugin],
    }),
  };

  Object.values(buildmap).forEach((build) =>
    build
      .then(async (context) => {
        if (watch) {
          await context.watch();
        } else {
          await context.rebuild();
          await context.dispose();
        }
      })
      .catch(() => process.exit(1)),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
