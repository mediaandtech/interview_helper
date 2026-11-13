// 셸 glob과 Node 버전별 디렉터리 탐색 차이 없이 같은 테스트 파일을 실행합니다.
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory=new URL('../tests/',import.meta.url);
const files=(await readdir(directory)).filter(name=>name.endsWith('.test.js')).sort().map(name=>fileURLToPath(new URL(name,directory)));
const child=spawn(process.execPath,['--test',...process.argv.slice(2),...files],{stdio:'inherit'});
child.once('error',err=>{console.error(err.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
