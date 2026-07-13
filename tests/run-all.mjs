import { spawn } from "node:child_process";

// Runs every test file sequentially, surfacing all failures (does not stop
// at the first failing file). Exits with code 1 if any test file failed.
const tests = ["tests/smoke.test.mjs", "tests/weather-email.test.mjs"];

let failed = false;
for (const file of tests) {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code !== 0) failed = true;
      resolve();
    });
    child.on("error", (err) => {
      console.error(`Failed to launch ${file}:`, err.message);
      failed = true;
      resolve();
    });
  });
}

if (failed) {
  console.error("Some test files failed.");
  process.exit(1);
}
