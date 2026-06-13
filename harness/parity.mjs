// Parity harness: prove the newly-ported engine produces byte-identical seed-driven output
// to the current Phaser engine. Run with `npm run harness`.
//
//   new engine  -> ./src/engine            (this repo)
//   current     -> ../spellcave/src/game   (the shippable Phaser repo, source of truth)
//
// Both are pure JS and run headless under Node; the comparison isolates engine logic, so a
// mismatch means the port changed behavior. Exit code is non-zero on any difference.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateGolden } from './golden.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const NEW_ROOT = path.resolve(here, '..');                       // spellcave-web
const OLD_ROOT = path.resolve(NEW_ROOT, '..', 'spellcave');      // current Phaser repo

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

  if (match) {
    console.log('\n✅ PARITY PASS — ported engine is byte-identical to the current engine for the fixed seed.');
    process.exit(0);
  }

  const diff = firstDiff(fresh, current);
  console.error('\n❌ PARITY FAIL — outputs diverge.');
  if (diff) {
    console.error(`First differing key: "${diff.key}"`);
    console.error('  new    :', canonical(diff.new).slice(0, 400));
    console.error('  current:', canonical(diff.current).slice(0, 400));
  }
  process.exit(1);
}

main().catch(err => {
  console.error('\nHarness error:', err);
  process.exit(2);
});
