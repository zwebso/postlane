// Writes privacy.html and terms.html next to the SPA shell so crawlers and
// directory reviewers that do not run JavaScript still get the full text.
import { build } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "dist-app", "client");
const bundle = path.join(root, "dist-app", ".prerender-legal.mjs");

await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import { MemoryRouter } from "react-router-dom";
      import { LegalPage } from "./src/legal";
      export const render = (kind) =>
        renderToStaticMarkup(<MemoryRouter initialEntries={["/" + kind]}><LegalPage kind={kind} /></MemoryRouter>);
    `,
    loader: "tsx",
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  packages: "external",
  outfile: bundle,
  logLevel: "warning",
});

const { render } = await import(pathToFileURL(bundle).href);
const shell = await readFile(path.join(client, "index.html"), "utf8");

const pages = {
  privacy: {
    title: "Privacy Policy — Postlane",
    description: "How Postlane, operated by TMD SPACE CO., LTD., handles personal data for its transactional email API.",
  },
  terms: {
    title: "Terms of Service — Postlane",
    description: "The agreement for using Postlane, the transactional email API at postlane.email.",
  },
};

for (const [kind, meta] of Object.entries(pages)) {
  const html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\/?>/, `<meta name="description" content="${meta.description}"/>`)
    .replace('<div id="root"></div>', `<div id="root"><main class="pl-publicinner">${render(kind)}</main></div>`);
  if (!html.includes("pl-legal")) throw new Error(`Prerender of ${kind} did not inject the page.`);
  await writeFile(path.join(client, `${kind}.html`), html);
}

await rm(bundle);
console.log("Prerendered privacy.html and terms.html");
