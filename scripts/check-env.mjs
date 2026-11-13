import {readFile} from 'node:fs/promises';
const expected=(await readFile(new URL('../.nvmrc',import.meta.url),'utf8')).trim();
if(!/^\d+\.\d+\.\d+$/.test(expected)) {
  console.error('.nvmrc에는 정확한 Node.js 버전이 필요합니다.');process.exitCode=1;
} else if(process.versions.node!==expected) {
  console.error(`팀 기준: Node.js ${expected} / 현재: ${process.versions.node}`);
  console.error(process.platform==='win32'?'Windows: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\use-node.ps1':'macOS/Linux: nvm install && nvm use');
  process.exitCode=1;
} else console.log(`Node.js ${expected} · .nvmrc와 일치합니다.`);
