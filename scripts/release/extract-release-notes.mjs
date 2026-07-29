import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2]?.trim();
const outputPath = process.argv[3]?.trim();

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Version must use numeric major.minor.patch format");
}

const changelog = (await readFile("CHANGELOG.md", "utf8")).replaceAll("\r\n", "\n");
const escapedVersion = version.replaceAll(".", "\\.");
const section = changelog.match(
  new RegExp(`(?:^|\\n)## ${escapedVersion}(?: - [^\\n]+)?\\n([\\s\\S]*?)(?=\\n## |$)`),
);
const notes = section?.[1].trim();

if (!notes) {
  throw new Error(`Missing release notes for ${version} in CHANGELOG.md`);
}

if (outputPath) {
  await writeFile(outputPath, `${notes}\n`, "utf8");
} else {
  process.stdout.write(`${notes}\n`);
}
