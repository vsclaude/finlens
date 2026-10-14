import console from "node:console"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

/**
 * Gives a copy of the template its own name, once, right after it is cloned.
 *
 *   node scripts/rename.mjs "My App" [my-app] [com.example.myapp]
 *
 * The slug and the app id are derived from the name when left out. Every place
 * the template's name is spelled is listed below rather than found by a search
 * over the tree: a blind replace of "app-template" would also rewrite this
 * script and the docs explaining it.
 */
const [name, slugArg, idArg] = process.argv.slice(2)
if (!name) {
  console.error('usage: node scripts/rename.mjs "My App" [my-app] [app-id]')
  process.exit(1)
}

const slug =
  slugArg ??
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
const appId = idArg ?? `com.example.${slug.replace(/-/g, "")}`
/** What electron-builder names an installer: no spaces in a download. */
const artifact = name.replace(/[^A-Za-z0-9]+/g, "-")
/** The environment variable that moves the data directory. */
const envPrefix = slug.toUpperCase().replace(/-/g, "_")

const root = path.join(import.meta.dirname, "..")

/** [file, from, to] — every spelling of the template's names. */
const edits = [
  ["package.json", '"name": "app-template"', `"name": "${slug}"`],
  [
    "package.json",
    /"productName": "App Template"/g,
    `"productName": "${name}"`,
  ],
  ["package.json", "com.example.apptemplate", appId],
  ["package.json", /App-Template-\$/g, `${artifact}-$`],
  ["src/shared/app.ts", 'APP_NAME = "App Template"', `APP_NAME = "${name}"`],
  [
    "src/shared/app.ts",
    'DATA_DIR_NAME = ".app-template"',
    `DATA_DIR_NAME = ".${slug}"`,
  ],
  [
    "src/shared/app.ts",
    'DATA_DIR_ENV = "APP_TEMPLATE_DATA_DIR"',
    `DATA_DIR_ENV = "${envPrefix}_DATA_DIR"`,
  ],
  [
    "src/renderer/index.html",
    "<title>App Template</title>",
    `<title>${name}</title>`,
  ],
  ["tsconfig.base.json", '"display": "App Template', `"display": "${name}`],
  ["README.md", /^# App Template$/m, `# ${name}`],
  ["CLAUDE.md", /^\*\*App Template\*\*/m, `**${name}**`],
]

for (const [file, from, to] of edits) {
  const target = path.join(root, file)
  const text = readFileSync(target, "utf8")
  const next = text.replace(from, to)
  if (next === text) {
    console.warn(`  skip ${file}: ${from} not found (already renamed?)`)
    continue
  }
  writeFileSync(target, next)
  console.log(`  ok   ${file}`)
}

console.log(`\nRenamed to "${name}" (${slug}, ${appId}).`)
console.log(
  "Replace resources/icon.png and src/renderer/public/favicon.svg too."
)
