import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MIME_TYPES, resolveAsset } from '../scripts/serve.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('정적 서버가 JavaScript와 MediaPipe 자산 MIME을 제공한다',()=>{
  assert.equal(MIME_TYPES['.mjs'],'text/javascript; charset=utf-8');
  assert.equal(MIME_TYPES['.wasm'],'application/wasm');
  assert.equal(MIME_TYPES['.task'],'application/octet-stream');
});
test('정적 서버가 루트 index와 모듈 파일을 찾는다',async()=>{
  assert.equal(await resolveAsset(root,'/?demo=1'),path.join(root,'index.html'));
  assert.equal(await resolveAsset(root,'/js/config.js'),path.join(root,'js/config.js'));
});
test('정적 서버가 숨김 파일과 경로 이탈을 차단한다',async()=>{
  for(const url of ['/../private','/%2e%2e/private','/.env','/.git/config','/node_modules/x','/..%5cx'])
    await assert.rejects(resolveAsset(root,url),error=>error.status===403);
});
test('정적 서버가 잘못된 URL과 없는 파일을 구분한다',async()=>{
  await assert.rejects(resolveAsset(root,'/%XX'),error=>error.status===400);
  await assert.rejects(resolveAsset(root,'/missing.xyz'),error=>error.status===404);
});
