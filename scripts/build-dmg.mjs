import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMacOSDiskImageDmg } from '../src/utils/macosAppBuilder.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'OPUNG-Installer.dmg');

const dmgBuffer = buildMacOSDiskImageDmg();
fs.writeFileSync(outputPath, Buffer.from(dmgBuffer));

const stats = fs.statSync(outputPath);
console.log(`Generated ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
