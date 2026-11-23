// 설치 의존성 없는 개발용 정적 파일 서버. 127.0.0.1에서만 실행됩니다.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export const MIME_TYPES={
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.wasm':'application/wasm',
  '.task':'application/octet-stream', '.ico':'image/x-icon',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp',
};
const httpError=(status)=>Object.assign(new Error('Request rejected'),{status});

export async function resolveAsset(root,rawUrl) {
  let pathname;
  try { pathname=decodeURIComponent(rawUrl.split('?')[0]); } catch { throw httpError(400); }
  if(!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) throw httpError(403);
  const parts=pathname.split('/').filter(Boolean);
  if(parts.some(part=>part.startsWith('.') || part==='node_modules')) throw httpError(403);
  const base=await realpath(root);
  let candidate=path.resolve(base,`.${pathname}`);
  if(candidate!==base && !candidate.startsWith(base+path.sep)) throw httpError(403);
  try {
    if((await stat(candidate)).isDirectory()) candidate=path.join(candidate,'index.html');
    candidate=await realpath(candidate);
    if(candidate!==base && !candidate.startsWith(base+path.sep)) throw httpError(403);
    if(!(await stat(candidate)).isFile()) throw httpError(404);
    return candidate;
  } catch(error) {
    if(error.status) throw error;
    throw httpError(404);
  }
}

export function createRequestHandler(root) {
  return async (request,response)=>{
    if(!['GET','HEAD'].includes(request.method)) {
      response.writeHead(405,{'allow':'GET, HEAD'}); response.end('Method Not Allowed'); return;
    }
    try {
      const asset=await resolveAsset(root,request.url);
      response.writeHead(200,{
        'Content-Type':MIME_TYPES[path.extname(asset).toLowerCase()] || 'application/octet-stream',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
        'Permissions-Policy':'camera=(self), microphone=(self)',
      });
      if(request.method==='HEAD') { response.end(); return; }
      await pipeline(createReadStream(asset),response);
    } catch(error) {
      if(response.headersSent) { response.destroy(); return; }
      const status=error.status || 500;
      response.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});
      response.end({400:'Bad Request',403:'Forbidden',404:'Not Found'}[status] || 'Internal Server Error');
    }
  };
}

const executedPath=process.argv[1] && path.resolve(process.argv[1]);
if(executedPath===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const port=Number(process.env.PORT || 5500);
  if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT는 1~65535 사이 정수여야 합니다.');
  const server=http.createServer(createRequestHandler(root));
  server.on('error',error=>{ console.error(error.code==='EADDRINUSE'?'포트가 사용 중입니다. Live Server를 종료하거나 PORT를 변경하세요.':'서버를 시작할 수 없습니다.'); process.exitCode=1; });
  server.listen(port,'127.0.0.1',()=>console.log(`인터뷰 스튜디오: http://127.0.0.1:${port}/index.html`));
}
