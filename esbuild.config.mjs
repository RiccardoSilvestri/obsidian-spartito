import esbuild from "esbuild";
import { readFile, stat } from "node:fs/promises";

const production = process.argv.includes("production");

const stripFontCdn = {
  name: "strip-font-cdn",
  setup(build) {
    build.onLoad({ filter: /vexflow.*\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const contents = source.split("https://cdn.jsdelivr.net/npm/@vexflow-fonts/").join("");
      return { contents, loader: "js" };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  external: ["obsidian", "electron"],
  plugins: [stripFontCdn],
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  minify: production,
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
  const { size } = await stat("main.js");
  console.log(`Build complete: main.js (${(size / 1024).toFixed(1)} kB) [production]`);
} else {
  await context.watch();
  console.log("Watching src/main.js for changes...");
}
