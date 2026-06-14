// Parity harness: prove the newly-ported engine produces byte-identical seed-driven output
// to the current Phaser engine. Run with `npm run harness`.
//
//   new engine  -> ./src/engine            (this repo)
//   current     -> ../spellcave/src/game   (the shippable Phaser repo, source of truth)
//
// Both are pure JS and run headless under Node; the comparison isolates engine logic, so a
// mismatch means the port changed behavior. Exit code is non-zero on any difference.

import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { generateGolden } from './golden.mjs';
import { generateSquareGolden } from './square-golden.mjs';
import { generateCaveGolden } from './cave-golden.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const NEW_ROOT = path.resolve(here, '..');                       // spellcave-web
const OLD_ROOT = path.resolve(NEW_ROOT, '..', 'spellcave');      // current Phaser repo
const SQUARE_GOLDEN_FILE = path.join(here, 'square-golden.json'); // committed self-golden baseline
const CAVE_GOLDEN_FILE = path.join(here, 'cave-golden.json');     // committed self-golden baseline

const engines = {
  new:     { dir: path.join(NEW_ROOT, 'src', 'engine'), root: NEW_ROOT },
  current: { dir: path.join(OLD_ROOT, 'src', 'game'),   root: OLD_ROOT },
};

// Stable stringify (sorted keys) so the comparison is order-independent for objects.
function canonical(value) {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((acc, k) => ((acc[k] = v[k]), acc), {});
    }
    return v;
  });
}

// Find the first differing key for a useful error message.
function firstDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    if (canonical(a[k]) !== canonical(b[k])) {
      return { key: k, new: a[k], current: b[k] };
    }
  }
  return null;
}

async function main() {
  console.log('Generating golden output from current (Phaser) engine...');
  const current = await generateGolden(engines.current.dir, engines.current.root);

  console.log('Generating golden output from new (HTML/React) engine...');
  const fresh = await generateGolden(engines.new.dir, engines.new.root);

  const match = canonical(fresh) === canonical(current);

  console.log('\nEngine metadata (new):', JSON.stringify(fresh.meta));
  console.log('Sample random words   :', fresh.randomWords.slice(0, 6).join(', '));
  console.log('Sample token chain    :', fresh.extraProbChain.slice(0, 12).join(''));

  if (!match) {
    const diff = firstDiff(fresh, current);
    console.error('\n❌ PARITY FAIL — outputs diverge.');
    if (diff) {
      console.error(`First differing key: "${diff.key}"`);
      console.error('  new    :', canonical(diff.new).slice(0, 400));
      console.error('  current:', canonical(diff.current).slice(0, 400));
    }
    process.exit(1);
  }
  console.log('\n✅ PARITY PASS — ported engine is byte-identical to the current engine for the fixed seed.');

  // New-engine self-goldens for the de-Phasered model (Phase 2). These have no old-side
  // counterpart — the old Square/Cave extend Phaser.GameObjects.Container and can't run headless —
  // so they lock the ported behavior against a committed baseline instead of cross-comparing.
  const okSquare = await checkSelfGolden('SQUARE', SQUARE_GOLDEN_FILE,
    () => generateSquareGolden(engines.new.dir, engines.new.root));
  const okCave = await checkSelfGolden('CAVE', CAVE_GOLDEN_FILE,
    () => generateCaveGolden(engines.new.dir, engines.new.root));

  process.exit(okSquare && okCave ? 0 : 1);
}

// Generate a new-engine self-golden and compare to its committed baseline (writing the baseline
// on first run). Returns true on pass / freshly-written baseline, false on mismatch.
async function checkSelfGolden(name, file, generateFn) {
  console.log(`\nGenerating ${name} self-golden (new engine)...`);
  const result = await generateFn();
  const rel = path.relative(NEW_ROOT, file);

  if (!existsSync(file)) {
    writeFileSync(file, canonical(result) + '\n');
    console.log(`📝 ${name} GOLDEN BASELINE WRITTEN — ${rel} (review & commit it).`);
    return true;
  }

  const baseline = readFileSync(file, 'utf8').trim();
  if (canonical(result) === baseline) {
    console.log(`✅ ${name} GOLDEN PASS — ported snapshots match the committed baseline.`);
    return true;
  }

  const diff = firstDiff(result, JSON.parse(baseline));
  console.error(`\n❌ ${name} GOLDEN FAIL — ported snapshots changed.`);
  if (diff) {
    console.error(`First differing key: "${diff.key}"`);
    console.error('  new     :', canonical(diff.new).slice(0, 400));
    console.error('  baseline:', canonical(diff.current).slice(0, 400));
  }
  console.error(`If this change is intentional, delete ${rel} and re-run to regenerate it.`);
  return false;
}

main().catch(err => {
  console.error('\nHarness error:', err);
  process.exit(2);
});
