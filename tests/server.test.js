import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Writable} from 'node:stream';
import {createRequestHandler,resolveAsset} from '../scripts/serve.mjs';

const fixture=await mkdtemp(path.join(tmpdir(),'speechboard-server-'));
const root=path.join(fixture,'public');await mkdir(root);
await writeFile(path.join(root,'index.html'),'<h1>SpeechBoard</h1>');
await writeFile(path.join(root,'module.mjs'),'export const value = 1;');
await writeFile(path.join(root,'model.wasm'),Buffer.from([0,97,115,109]));
await writeFile(path.join(fixture,'outside.txt'),'private');
after(()=>rm(fixture,{recursive:true,force:true}));
class Response extends Writable {
  headers={};chunks=[];statusCode=0;headersSent=false;
  setHeader(key,value){this.headers[key.toLowerCase()]=value;}
  writeHead(status,headers={}){this.statusCode=status;for(const [k,v] of Object.entries(headers))this.setHeader(k,v);this.headersSent=true;}
  _write(chunk,encoding,done){this.chunks.push(Buffer.from(chunk));done();}
}
async function request(url,method='GET'){
  const res=new Response();await createRequestHandler(root)({url,method},res);
  return {...res,body:Buffer.concat(res.chunks).toString()};
}
test('Node server serves the root document without caching',async()=>{
  const r=await request('/?demo=1');assert.equal(r.statusCode,200);assert.match(r.body,/SpeechBoard/);
  assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['content-type'],'text/html; charset=utf-8');
});
test('MediaPipe modules and wasm have correct MIME types',async()=>{
  assert.equal((await request('/module.mjs')).headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal((await request('/model.wasm')).headers['content-type'],'application/wasm');
});
test('HEAD returns metadata without a body; mutations are rejected',async()=>{
  const head=await request('/','HEAD');assert.equal(head.statusCode,200);assert.equal(head.body,'');
  const post=await request('/','POST');assert.equal(post.statusCode,405);assert.equal(post.headers.allow,'GET, HEAD');
});
test('repository internals, local env files and traversal paths cannot be served',async()=>{
  for(const url of ['/.git/config','/.env','/node_modules/playwright/package.json','/../outside.txt','/%2e%2e/outside.txt','/..%5coutside.txt']){
    assert.equal((await request(url)).statusCode,403,url);
  }
});
test('bad URLs and missing files return HTTP errors without exposing local paths',async()=>{
  assert.equal((await request('/%ZZ')).statusCode,400);
  const r=await request('/does-not-exist');assert.equal(r.statusCode,404);assert.equal(r.body,'Not Found');assert.ok(!r.body.includes(fixture));
});
test('symlink escaping the project root is blocked',{skip:process.platform==='win32'},async()=>{
  await symlink(path.join(fixture,'outside.txt'),path.join(root,'public.txt'));
  await assert.rejects(resolveAsset(root,'/public.txt'),e=>e.status===403);
});
