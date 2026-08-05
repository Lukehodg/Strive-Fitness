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

const steps = [
  ["typecheck", "npx", ["tsc", "--noEmit"]],
  ["execution", "npx", ["tsx", "server/trading/executionChecks.ts"]],
  ["portfolio", "npx", ["tsx", "server/trading/portfolioChecks.ts"]],
  ["portfolio vol", "npx", ["tsx", "server/trading/portfolioVolChecks.ts"]],
  ["confidence", "npx", ["tsx", "server/trading/confidenceChecks.ts"]],
  ["events", "npx", ["tsx", "server/trading/eventChecks.ts"]],
  ["selector", "npx", ["tsx", "server/trading/selectorChecks.ts"]],
  ["expectancy", "npx", ["tsx", "server/trading/expectancyChecks.ts"]],
  // The last two catch what unit tests structurally cannot: a price process
  // that is not market-like, and a setting that can never bind. Both have
  // already caught real, shipped bugs that everything above missed.
  ["market facts", "npx", ["tsx", "server/trading/factsCheck.ts"]],
  ["calibration", "npx", ["tsx", "server/calibrate.ts"]],
];

const failed = [];
for (const [name, cmd, args] of steps) {
  process.stdout.write(`  ${name.padEnd(16)}`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`ok    ${secs}s`);
  } else {
    console.log(`FAIL  ${secs}s`);
    failed.push([name, (r.stdout || "") + (r.stderr || "")]);
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
