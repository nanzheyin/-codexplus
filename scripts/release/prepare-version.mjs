import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const version = process.argv[2]?.trim();
const checkOnly = process.argv.includes("--check");
const root = process.cwd();

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Version must use numeric major.minor.patch format");
}

function replaceRequired(source, pattern, replacement, file) {
  const updated = source.replace(pattern, replacement);
  if (updated === source) {
    throw new Error(`Expected version field was not updated in ${file}`);
  }
  return updated;
}

async function updateTextFile(relativePath, transform) {
  const file = path.join(root, relativePath);
  const source = await readFile(file, "utf8");
  const updated = transform(source, relativePath);
  if (!checkOnly) {
    await writeFile(file, updated, "utf8");
  }
}

async function updateJsonFile(relativePath, transform) {
  await updateTextFile(relativePath, (source) => {
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const value = JSON.parse(source);
    transform(value);
    return `${JSON.stringify(value, null, 2).replaceAll("\n", newline)}${newline}`;
  });
}

await updateTextFile("Cargo.toml", (source, file) =>
  replaceRequired(
    source,
    /(\[workspace\.package\]\r?\nversion\s*=\s*")[^"]+("\s*)/,
    `$1${version}$2`,
    file,
  ),
);

await updateTextFile("Cargo.lock", (source, file) => {
  let updated = source;
  for (const packageName of [
    "codex-plus-core",
    "codex-plus-data",
    "codex-plus-launcher",
    "codex-plus-manager",
  ]) {
    updated = replaceRequired(
      updated,
      new RegExp(
        `(\\[\\[package\\]\\]\\r?\\nname = "${packageName}"\\r?\\nversion = ")[^"]+("\\s*)`,
      ),
      `$1${version}$2`,
      file,
    );
  }
  return updated;
});

await updateJsonFile("apps/codex-plus-manager/package.json", (value) => {
  value.version = version;
});

await updateJsonFile("apps/codex-plus-manager/package-lock.json", (value) => {
  value.version = version;
  value.packages[""].version = version;
});

await updateJsonFile("apps/codex-plus-manager/src-tauri/tauri.conf.json", (value) => {
  value.version = version;
});

await updateTextFile("CHANGELOG.md", (source, file) => {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const pattern = /## Unreleased\r?\n([\s\S]*?)(?=\r?\n## )/;
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Missing Unreleased section in ${file}`);
  }
  const date = new Date().toISOString().slice(0, 10);
  const notes = match[1].trim() || "- 自动发布 `main` 分支最新提交。";
  return source.replace(
    pattern,
    `## Unreleased${newline}${newline}## ${version} - ${date}${newline}${newline}${notes}${newline}`,
  );
});

console.log(`${checkOnly ? "Validated" : "Prepared"} version ${version}`);
