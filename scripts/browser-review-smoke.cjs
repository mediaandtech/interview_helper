const {launchBrowser,artifactPath}=require('./browser-support.cjs');
(async () => {
 const browser = await launchBrowser();
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.stack || e.message)); page.on('console',msg=>{if(msg.type()==='warning' && msg.text().includes('frame skipped')) errors.push(msg.text());});
 await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:8081');
 await page.locator('#question').fill('지원 동기 <script> test');
 await page.locator('#demo-start').click();
 await page.waitForTimeout(4500);
 await page.locator('#toggle-metrics').click();
 await page.waitForTimeout(1200);
 await page.getByRole('button',{name:'답변 끝내기 (Esc)'}).click();
 await page.getByRole('tab',{name:'전체 복기'}).click();
 await page.locator('#reflection').fill('핵심을 먼저 말해 보기');
 await page.locator('#review-time').fill('1.5');
 await page.getByRole('tab',{name:'현재 위치'}).click();
 await page.locator('#marker-note').fill('이 위치 다시 듣기');
 await page.locator('#add-marker').click();
 await page.screenshot({path:artifactPath('speechboard-review.png'),fullPage:true});
 if(await page.locator('#markers li').count()!==1) throw Error('marker missing');
 if(await page.evaluate(()=>app.reviewSessions.length)!==0) throw Error('demo polluted history');
 await page.locator('#retry').click();
 if(await page.locator('#question').inputValue()!=='지원 동기 <script> test') throw Error('question not preserved');
 await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:artifactPath('speechboard-setup-mobile.png'),fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('mobile setup overflow');
 // 상단 버튼 3개는 OS 글꼴에 따라 너비가 달라 375px만으로는 macOS에서 잡히지 않음 → 더 좁은 폭에서도 확인
 await page.setViewportSize({width:320,height:812});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('narrow mobile setup overflow');
 await page.setViewportSize({width:375,height:812});
 await page.locator('#demo-start').click();
 await page.getByRole('button',{name:'답변 끝내기 (Esc)'}).click();
 await page.locator('#review-time').waitFor(); // 복기 화면 도착 신호(#reflection 은 '전체 복기' 탭 안이라 숨겨져 있음)
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('mobile report overflow');
 await page.screenshot({path:artifactPath('speechboard-review-mobile.png'),fullPage:true});
 // Exercise native MediaRecorder with synthetic media; never access the user's devices.
 await page.setViewportSize({width:1280,height:900});
 async function syntheticAnswer() {
   await page.evaluate(async () => {
     app.go('setup');
     const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=240;
     const ctx=canvas.getContext('2d'); ctx.fillStyle='steelblue';ctx.fillRect(0,0,320,240);
     const stream=canvas.captureStream(10);
     const audioCtx=new AudioContext(); await audioCtx.resume();
     const oscillator=audioCtx.createOscillator(), destination=audioCtx.createMediaStreamDestination();
     oscillator.connect(destination);oscillator.start();
     const video=document.createElement('video');video.muted=true;video.srcObject=stream;await video.play();
     window.testTracks=[...stream.getTracks(),...destination.stream.getTracks()];
     app.sensors={
       audio:{stream:destination.stream,read:()=>({db:-25,speaking:true,hz:180}),stop(){destination.stream.getTracks().forEach(t=>t.stop());audioCtx.close();}},
       gaze:{video,detect:()=>({face:{yaw:0,pitch:0,eye:{}},landmarks:null}),stop(){stream.getTracks().forEach(t=>t.stop());}},
     };
     app.settings={presetKey:'interview',question:'동일 질문',durationSec:60,rateMin:260,rateMax:320,gazeTarget:.85,focusMode:true,recordAnswer:true,calib:{baseDb:-25,baseHz:180,yaw0:0,pitch0:0,eye0:{}}};
     app.go('practice');
   });
   await page.waitForTimeout(4700);
   await page.getByRole('button',{name:'답변 끝내기 (Esc)'}).click();
   await page.locator('#answer-player').waitFor();
   await page.waitForFunction(()=>document.querySelector('#answer-player')?.readyState>=2);
   if(!await page.evaluate(()=>testTracks.every(t=>t.readyState==='ended'))) throw Error('device tracks leaked');
 }
 await syntheticAnswer();
 await page.getByRole('tab',{name:'전체 복기'}).click();
 await page.locator('#reflection').fill('첫 번째 답변 메모');
 await page.locator('#review-time').fill('0.5');
 await page.waitForFunction(()=>Math.abs(document.querySelector('#answer-player').currentTime-.5)<.15);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#download-media').click();
 const download=await downloadPromise;
 if(!download.suggestedFilename().startsWith('answer-')) throw Error('download missing');
 await syntheticAnswer();
 await page.locator('#previous-answer').selectOption({index:1});
 await page.locator('#previous-player').waitFor();
 if(!await page.locator('#comparison-content').textContent().then(t=>t.includes('첫 번째 답변 메모'))) throw Error('comparison note missing');
 if(await page.evaluate(()=>app.reviewSessions.length)!==2) throw Error('real history missing');
 await page.getByRole('tab',{name:'전체 복기'}).click();
 await page.locator('#reflection').fill('두 번째 답변 메모');
 await page.locator('#delete-media').click();
 if(await page.locator('#answer-player').count()) throw Error('deleted media still present');
 if(await page.locator('#reflection').inputValue()!=='두 번째 답변 메모') throw Error('note lost after media deletion');
 await page.locator('#clear-history').click();
 if(await page.evaluate(()=>app.reviewSessions.length)!==0) throw Error('clear history failed');
 // Late media permissions must not overwrite a demo that has already started.
 await page.evaluate(() => {
   window.originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   const ctx=new AudioContext(), dest=ctx.createMediaStreamDestination();
   window.delayedTrack=dest.stream.getAudioTracks()[0]; window.delayedCtx=ctx;
   navigator.mediaDevices.getUserMedia=constraints=>constraints.audio ? new Promise(resolve=>{window.resolveAudio=()=>resolve(dest.stream);}) : Promise.reject(new DOMException('no camera','NotFoundError'));
 });
 await page.locator('#calib-run').click();
 await page.waitForFunction(()=>!!window.resolveAudio);
 await page.locator('#demo-start').click();
 await page.evaluate(()=>window.resolveAudio());
 await page.waitForTimeout(500);
 if(!await page.evaluate(()=>app.sensors.audio.demo && delayedTrack.readyState==='ended')) throw Error('late initialization overwrote demo or leaked track');
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=originalGetUserMedia;delayedCtx.close();});
 console.log(JSON.stringify({errors,completed:'demo, empty review, markers, settings, mobile, native recording, seek, download, comparison, delete, stale initialization'}));
 await browser.close();
 if(errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
