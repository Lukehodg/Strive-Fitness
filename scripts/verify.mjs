// One command that runs every gate in the project.
//
//   npm test
//
// Ten separate commands is nine too many to run habitually, and a check you
// stop running stops being a check. This is the whole discipline in one place:
// types, the unit suites, the price-generator stylized facts, and the
// calibration probe that catches settings which cannot bind.
//
// Ordered cheapest-first so the fastest signal arrives first, and it does NOT
// stop at the first failure — seeing every problem at once is worth a few extra
// seconds when you are about to fix them all anyway.

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Run the tools with THIS node, pointing at their JS entry points, rather than
// shelling out to `npx`.
//
// The first version used spawnSync("npx", args) directly, which fails on
// Windows because npx is a .cmd shim. Adding shell:true fixed that and
// introduced two new problems: Node 22 deprecates passing an args ARRAY with
// shell:true (DEP0190 — arguments are concatenated, not escaped), and every
// gate paid npx's resolution overhead, roughly doubling the runtime.
//
// Invoking the entry points directly avoids all three. There is no shell, so
// nothing to escape; no .cmd, so nothing platform-specific; and no npx, so no
// per-gate resolution cost.
const TSC = join("node_modules", "typescript", "bin", "tsc");
const TSX = join("node_modules", "tsx", "dist", "cli.mjs");

for (const [label, path] of [["typescript", TSC], ["tsx", TSX]]) {
  if (!existsSync(path)) {
    console.error(`  ${label} is missing at ${path} — run \`npm install\` first.`);
    process.exit(1);
  }
}
const node = process.execPath;

// Dependencies must exist before anything else is worth trying. Without this,
// a missing node_modules made all ten gates "fail" with no explanation.
if (!existsSync("node_modules")) {
  console.error("  node_modules is missing — run `npm install` first.");
  process.exit(1);
}

const check = (file) => [node, [TSX, join("server", "trading", file)]];

const steps = [
  ["typecheck", node, [TSC, "--noEmit"]],
  ["execution", ...check("executionChecks.ts")],
  ["portfolio", ...check("portfolioChecks.ts")],
  ["portfolio vol", ...check("portfolioVolChecks.ts")],
  ["confidence", ...check("confidenceChecks.ts")],
  ["events", ...check("eventChecks.ts")],
  ["selector", ...check("selectorChecks.ts")],
  ["expectancy", ...check("expectancyChecks.ts")],
  ["forex", ...check("forexChecks.ts")],
  // The last two catch what unit tests structurally cannot: a price process
  // that is not market-like, and a setting that can never bind. Both have
  // already caught real, shipped bugs that everything above missed.
  ["market facts", ...check("factsCheck.ts")],
  // Calibration runs PER PRESET, not once on the default config.
  //
  // Every setting here is volatility-denominated, and a one-pair universe does
  // not have the same reachable portfolio volatility as a seven-pair one. A
  // single run on whichever universe happens to be configured says nothing
  // about the others, which is how the FX preset first shipped with two
  // controls that could never bind while the gate reported green.
  ...["majors", "tightest", "eurusd"].map((preset) => [
    `calibrate:${preset}`,
    node,
    [TSX, join("server", "calibrate.ts"), `preset=${preset}`],
  ]),
];

const failed = [];
for (const [name, cmd, args] of steps) {
  process.stdout.write(`  ${name.padEnd(22)}`);
  const started = Date.now();
  // No shell: cmd is always the node binary and args are always real paths.
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`ok    ${secs}s`);
  } else {
    console.log(`FAIL  ${secs}s`);
    // Distinguish "the command never ran" from "the test failed". They look
    // identical in a summary table and need completely different fixes.
    //
    // Two shapes, because shell:true changes how the failure surfaces:
    //   - r.error set (spawn itself failed, e.g. EACCES)
    //   - status 127 (the SHELL could not find the command)
    // Neither means a check found a problem with the code.
    const launchError =
      r.error || r.status === 127
        ? `could not run "${cmd}" — ${r.error?.message ?? "command not found"}\n` +
          `This is a LAUNCH failure, not a test failure. Try \`npm install\`.\n`
        : "";
    failed.push([name, launchError + (r.stdout || "") + (r.stderr || "")]);
  }
}

if (failed.length) {
  for (const [name, output] of failed) {
    console.log(`\n${"=".repeat(60)}\n${name}\n${"=".repeat(60)}`);
    // Only the failing lines, or the tail if nothing matched — full output
    // from ten suites buries the thing you actually need to read.
    const lines = output.split("\n");
    const interesting = lines.filter((l) => /FAIL|error|Error|INERT/.test(l));
    console.log((interesting.length ? interesting : lines.slice(-25)).join("\n"));
  }
  console.log(
    `\n${failed.length} of ${steps.length} GATES FAILED: ${failed.map((f) => f[0]).join(", ")}`,
  );
  process.exit(1);
}
console.log(`\nAll ${steps.length} gates pass.`);
