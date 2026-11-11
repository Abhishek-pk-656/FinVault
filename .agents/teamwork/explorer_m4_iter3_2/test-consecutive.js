const { spawnSync } = require('child_process');
const path = require('path');

const hookPath = path.resolve(__dirname, 'hook-wbw-and-clean.js');
const nextBin = path.resolve(__dirname, '../../../apps/web/node_modules/next/dist/bin/next');
const webDir = path.resolve(__dirname, '../../../apps/web');

console.log('Testing 5 consecutive Next.js builds with webpackBuildWorker: false AND cleanDistDir: false...');

let passed = 0;
let failed = 0;

for (let i = 1; i <= 5; i++) {
  console.log(`\n--- Build Iteration ${i}/5 ---`);
  const start = Date.now();
  const res = spawnSync(process.execPath, ['-r', hookPath, nextBin, 'build', webDir], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (res.status === 0) {
    console.log(`[PASS] Iteration ${i} passed in ${elapsed}s (exit code 0)`);
    passed++;
  } else {
    console.error(`[FAIL] Iteration ${i} failed in ${elapsed}s (exit code ${res.status})`);
    console.error(res.stderr || res.stdout.slice(-500));
    failed++;
  }
}

console.log(`\nSummary: ${passed}/5 passed, ${failed}/5 failed.`);
