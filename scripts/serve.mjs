/** 의존성 없는 로컬 정적 서버. npm start [-- 포트] */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.wasm':'application/wasm',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf',
};
const httpError = status => Object.assign(new Error(http.STATUS_CODES[status]), {status});
export async function resolveAsset(root, requestUrl) {
  let pathname;
  try { pathname=decodeURIComponent(requestUrl.split('?')[0]).replaceAll('\\','/'); }
  catch { throw httpError(400); }
  const parts=pathname.split('/').filter(Boolean);
  if(parts.some(p=>p.startsWith('.') || p==='node_modules')) throw httpError(403);
  const base=await realpath(root);
  const file=await realpath(path.join(base,...parts, ...(parts.length && !pathname.endsWith('/')?[]:['index.html'])));
  const rel=path.relative(base,file);
  if(rel==='..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw httpError(403);
  const info=await stat(file);
  if(!info.isFile()) throw httpError(404);
  return {file,size:info.size,type:MIME[path.extname(file).toLowerCase()]??'application/octet-stream'};
}
export function createRequestHandler(root=PROJECT_ROOT) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)) {
      res.setHeader('Allow','GET, HEAD');res.writeHead(405);res.end('Method Not Allowed');return;
    }
    try {
      const asset=await resolveAsset(root,req.url??'/');
      res.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.size});
      if(req.method==='HEAD') res.end();
      else await pipeline(createReadStream(asset.file),res);
    } catch(err) {
      if(res.headersSent) {res.destroy();return;}
      const status=err.status??(['ENOENT','ENOTDIR'].includes(err.code)?404:err.code==='EACCES'?403:500);
      res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(http.STATUS_CODES[status]);
    }
  };
}
export const createDevServer = (options={}) => http.createServer(createRequestHandler(options.root??PROJECT_ROOT));

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const port=Number(process.argv[2]??process.env.PORT??8081);
  if(!Number.isInteger(port)||port<1||port>65535) {console.error('포트는 1~65535 사이의 정수여야 합니다.');process.exitCode=1;}
  else {
    const server=createDevServer();
    server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`포트 ${port}가 사용 중입니다. npm start -- ${port+1} 로 다른 포트를 선택하세요.`:err.message);process.exitCode=1;});
    server.listen(port,'127.0.0.1',()=>console.log(`http://localhost:${port} 에서 실행 중 (Ctrl+C로 종료)`));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
  }
}
