import { unlinkSync } from "fs";
// 1. Bundle TypeScript + dependencies into a single JS file
const build = Bun.spawnSync([
    "bun", "build", "./src/init.ts",
    "--outfile", "./dist/_bundle.js",
    "--minify",
    "--target", "browser"
]);
if (build.exitCode !== 0) {
    console.error(build.stderr.toString());
    process.exit(1);
}
// 2. Read both files
const js = await Bun.file("./dist/_bundle.js").text();
const html = await Bun.file("./index.html").text();
// 3. Replace the module script tag with the inlined bundle
// Use a function to avoid $& $1 etc. being interpreted as replacement patterns
const output = html.replace(/<script type="module" src="\.\/src\/init\.ts"><\/script>/, () => `<script type="module">\n${js}\n</script>`);
// 4. Write single output file
await Bun.write("./dist/index.html", output);
// 5. Remove temporary bundle
unlinkSync("./dist/_bundle.js");
console.log("✓ dist/index.html built");
