// Repairs files that the Capacitor CLI writes with a broken iOS platform
// placeholder (`.iOS(.v)`) when generating the Swift Package manifest.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = resolve('ios/App/CapApp-SPM/Package.swift');
const DEPLOYMENT_TARGET = '15.0';
const MIN_PLATFORM = `.iOS(.v${DEPLOYMENT_TARGET.split('.')[0]})`;

if (!existsSync(manifest)) {
  console.error(`[fix-ios] missing ${manifest}`);
  process.exit(1);
}

const source = readFileSync(manifest, 'utf8');
const patched = source.replace(/platforms:\s*\[\.iOS\(\.v[\d.]*\)\]/, `platforms: [${MIN_PLATFORM}]`);

if (patched !== source) {
  writeFileSync(manifest, patched, 'utf8');
  console.log(`[fix-ios] set platforms to [${MIN_PLATFORM}]`);
} else if (source.includes(`platforms: [${MIN_PLATFORM}]`)) {
  console.log('[fix-ios] Package.swift platforms already valid');
} else {
  console.error('[fix-ios] unable to locate platforms declaration in Package.swift');
  process.exit(1);
}
