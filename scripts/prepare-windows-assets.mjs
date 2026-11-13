import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MACOS_STANDALONE_APP_HTML } from '../src/utils/macosAppBuilder.ts';
import { buildOpungIcoBytes } from '../src/utils/windowsAppBuilder.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const resourcesDir = path.join(rootDir, 'windows', 'Resources');

fs.mkdirSync(resourcesDir, { recursive: true });

const htmlOutPath = path.join(resourcesDir, 'index.html');
const icoOutPath = path.join(resourcesDir, 'AppIcon.ico');

fs.writeFileSync(htmlOutPath, MACOS_STANDALONE_APP_HTML, 'utf8');
fs.writeFileSync(icoOutPath, Buffer.from(buildOpungIcoBytes()));

const htmlStats = fs.statSync(htmlOutPath);
const icoStats = fs.statSync(icoOutPath);

console.log(
  `Prepared Windows assets: index.html (${(htmlStats.size / 1024).toFixed(1)} KB), AppIcon.ico (${(icoStats.size / 1024).toFixed(1)} KB)`
);
