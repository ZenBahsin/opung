import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MACOS_INFO_PLIST,
  MACOS_NATIVE_JXA_SCRIPT,
  MACOS_NATIVE_LAUNCHER_SH,
  MACOS_NATIVE_OBJC_SOURCE,
  MACOS_STANDALONE_APP_HTML,
  buildOpungAppIconIcns,
  buildOpungDmgDsStore,
} from '../src/utils/macosAppBuilder.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const targetArg = process.argv[2] || 'dmg_stage';
const stageDir = path.resolve(rootDir, targetArg);

const appBundle = path.join(stageDir, 'OPUNG.app');
const macosDir = path.join(appBundle, 'Contents', 'MacOS');
const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
const appResDir = path.join(resourcesDir, 'app');

fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(appResDir, { recursive: true });

const icnsBytes = Buffer.from(buildOpungAppIconIcns());
const dsStoreBytes = Buffer.from(buildOpungDmgDsStore());

fs.writeFileSync(path.join(appBundle, 'Contents', 'Info.plist'), MACOS_INFO_PLIST, 'utf8');
fs.writeFileSync(path.join(resourcesDir, 'AppIcon.icns'), icnsBytes);
fs.writeFileSync(path.join(appResDir, 'index.html'), MACOS_STANDALONE_APP_HTML, 'utf8');
fs.writeFileSync(path.join(appResDir, 'native_host.m'), MACOS_NATIVE_OBJC_SOURCE, 'utf8');
fs.writeFileSync(path.join(appResDir, 'native_host.jxa.js'), MACOS_NATIVE_JXA_SCRIPT, 'utf8');

const opungExec = path.join(macosDir, 'OPUNG');
const studioExec = path.join(macosDir, 'RNNoiseStudio');
fs.writeFileSync(opungExec, MACOS_NATIVE_LAUNCHER_SH, 'utf8');
fs.writeFileSync(studioExec, MACOS_NATIVE_LAUNCHER_SH, 'utf8');
fs.chmodSync(opungExec, 0o755);
fs.chmodSync(studioExec, 0o755);

fs.writeFileSync(path.join(stageDir, '.DS_Store'), dsStoreBytes);
fs.writeFileSync(path.join(stageDir, '.VolumeIcon.icns'), icnsBytes);

const entitlementsPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <key>com.apple.security.device.microphone</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
`;
fs.writeFileSync(path.join(rootDir, 'opung-entitlements.plist'), entitlementsPlist, 'utf8');

console.log(`Exported OPUNG.app staging tree to ${stageDir}`);
