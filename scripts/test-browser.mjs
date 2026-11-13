// 임시 포트의 자체 서버를 사용하므로 다른 개발 서버와 충돌하지 않습니다.
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDevServer } from './serve.mjs';
const suites={review:'browser-review-smoke.cjs',gaze:'browser-gaze-smoke.cjs',print:'print-check.cjs'};
const selected=process.argv[2]??'all';
if(selected!=='all' && !suites[selected]) {console.error('사용법: node scripts/test-browser.mjs [all|review|gaze|print]');process.exitCode=1;}
else {
  const server=createDevServer();
  let child=null;
  const shutdown=()=>{child?.kill();server.close();};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try {
    const listening=once(server,'listening');server.listen(0,'127.0.0.1');await listening;
    const url=`http://127.0.0.1:${server.address().port}`;
    for(const [name,file] of Object.entries(suites)) {
      if(selected!=='all' && name!==selected)continue;
      console.log(`Browser check: ${name}`);
      child=spawn(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{stdio:'inherit',env:{...process.env,REVIEW_URL:url}});
      const [code]=await once(child,'exit');child=null;
      if(code!==0){process.exitCode=1;break;}
    }
  } catch(err) {
    console.error(err.message);process.exitCode=1;
  } finally {
    child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);
  }
}
