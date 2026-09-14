// Re-renders every perception-eval fixture PDF from its HTML source (ADR 0009).
//
//   npm run eval:render
//
// Each eval/fixtures/<name>/source.html is printed once to eval/fixtures/<name>/<name>.pdf.
// Rendering is manual and offline — never wired into CI or build. Requires WeasyPrint
// (https://weasyprint.org); see eval/README.md for install notes. WeasyPrint lays every
// absolutely-positioned run at its coordinate, so the resulting text layer has no column
// delimiters — the property that makes these fixtures resemble real Belastingdienst PDFs.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.join(process.cwd(), "eval", "fixtures");

// Prefer the `weasyprint` binary; fall back to `python3 -m weasyprint` for installs that
// only exposed the module (e.g. `pip install --user` without ~/.local/bin on PATH).
function resolveWeasyprint(): string[] {
  if (spawnSync("weasyprint", ["--version"], { stdio: "ignore" }).status === 0) {
    return ["weasyprint"];
  }
  if (spawnSync("python3", ["-m", "weasyprint", "--version"], { stdio: "ignore" }).status === 0) {
    return ["python3", "-m", "weasyprint"];
  }
  throw new Error(
    "WeasyPrint not found. Install it with `pipx install weasyprint` (or " +
      "`pip install --user weasyprint`) — see eval/README.md."
  );
}

function fixtureNames(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function render(command: string[], name: string): void {
  const dir = path.join(FIXTURES_DIR, name);
  const source = path.join(dir, "source.html");
  const output = path.join(dir, `${name}.pdf`);
  if (!existsSync(source)) {
    console.log(`  ${name}: no source.html, skipping`);
    return;
  }

  const [cmd, ...base] = command;
  const result = spawnSync(cmd, [...base, source, output], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`WeasyPrint failed for ${name} (exit ${result.status ?? "signal"})`);
  }
  console.log(`  ${name}: rendered ${path.relative(process.cwd(), output)}`);
}

function main(): void {
  const command = resolveWeasyprint();
  const names = fixtureNames();
  if (names.length === 0) {
    console.log("No fixtures found under eval/fixtures/.");
    return;
  }
  console.log(`Rendering ${names.length} fixture(s) with: ${command.join(" ")}`);
  for (const name of names) render(command, name);
  console.log("Done.");
}

main();
