// Repair generated Android files that Capacitor's template extraction leaves empty
// on cloud-synced folders (Google Drive / OneDrive), which breaks Gradle release builds.
// Run automatically by `npm run cap:sync`; safe to run any time.
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extract } = require('tar');

const TARGET = 'android/capacitor-cordova-android-plugins/build.gradle';
const ARCHIVE = 'node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz';
const ENTRY = 'build.gradle';
// CLI adds this during `cap sync`; the raw template alone leaves cdvPluginPostBuildExtras undefined.
const EXTENSIONS_HOOK = 'apply from: "cordova.variables.gradle"';
const EXTENSIONS_MARKER = '// PLUGIN GRADLE EXTENSIONS START';

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function restoreFromArchive() {
  const tmp = await mkdtemp(join(tmpdir(), 'cap-android-fix-'));
  try {
    await extract({ file: ARCHIVE, cwd: tmp });
    await copyFile(join(tmp, ENTRY), TARGET);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`repaired: ${TARGET} (${await sizeOf(TARGET)} bytes)`);
}

if ((await sizeOf(TARGET)) <= 0) {
  await restoreFromArchive();
}

const gradle = await readFile(TARGET, 'utf8');
if (gradle.includes(EXTENSIONS_MARKER) && !gradle.includes(EXTENSIONS_HOOK)) {
  await writeFile(
    TARGET,
    gradle.replace(EXTENSIONS_MARKER, `${EXTENSIONS_MARKER}\n${EXTENSIONS_HOOK}`)
  );
  console.log(`patched: ${EXTENSIONS_HOOK}`);
} else {
  console.log(`ok: ${TARGET}`);
}
