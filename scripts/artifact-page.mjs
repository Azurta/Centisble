// Turns dist-online/index.html into page content for hosts that supply their own <html>/<head>/<body> skeleton.
import fs from "node:fs";
const html = fs.readFileSync("dist-online/index.html", "utf8");
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join("\n");
const out = [
  pick(/<title>[\s\S]*?<\/title>/g),
  pick(/<meta name="theme-color"[^>]*>/g),
  pick(/<style[\s\S]*?<\/style>/g),
  '<div id="root"></div>',
  pick(/<script type="module"[\s\S]*?<\/script>/g),
].join("\n");
// Escape literal U+FFFD (used by bundled UTF-8 decoders) so hosts that flag it as corruption accept the file.
const safe = out.replaceAll("\uFFFD", "\\uFFFD");
fs.writeFileSync(process.argv[2] ?? "dist-online/page.html", safe);
console.log(`wrote ${(safe.length / 1024).toFixed(0)} KB`);
