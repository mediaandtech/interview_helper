// Synthetic eye features only; never requests access to the user's camera or microphone.
const {launchBrowser,artifactPath}=require('./browser-support.cjs');
(async()=>{
 const browser=await launchBrowser();
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='warning' && m.text().includes('frame skipped'))errors.push(m.text());});
  await page.route('**/js/sensors/gaze.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function initGaze(){return window.makeTestGaze();}'}));
  await page.addInitScript(()=>{
   navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Synthetic test: devices disabled','NotAllowedError'));
   window.gazeTest={closed:false,frozen:false,bad:false,stops:0};
   window.makeTestGaze=()=>{
    let last=-1,base=null,stopped=false;
    return {video:null,setBase(b){base=b;},stop(){if(!stopped)window.gazeTest.stops++;stopped=true;},detect(now){
     const ctl=window.gazeTest;
     if(ctl.frozen)return {fresh:false,face:null,landmarks:null,quality:{reason:'stale'}};
     const target=ctl.bad?'lens':document.querySelector('.precise-dialog')?.dataset.target||'lens';
     const truth={lens:[0,-.02,{}],center:[0,.02,{}],left:[-.12,.02,{left:.6}],right:[.12,.02,{right:.6}],up:[0,-.1,{up:.5}],down:[0,.12,{down:.7}]}[target];
     const blend={left:0,right:0,up:0,down:.05,blink:ctl.closed?.95:0,...truth[2]};
     const eye=()=>({state:ctl.closed?'closed':'ok',aperture:ctl.closed?.02:.3,width:.06,iris:{x:truth[0],y:truth[1]},blend});
     const n=Math.floor(now/33),fresh=n!==last;last=n;
     return {t:now,fresh,face:{yaw:0,pitch:0,size:.16,eye:blend,eyes:{L:eye(),R:eye()}},landmarks:null,quality:{reason:null}};
    }};
   };
  });
  await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8081');
  await page.locator('#question').fill('시선 인식 복기');
  await page.locator('#calib-run').click();
  await page.waitForFunction(()=>!document.querySelector('#precise-run').disabled);
  await page.locator('#precise-run').click();await page.locator('.precise-dialog').waitFor();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.precise-dialog'));
  if(!await page.locator('#precise-status').textContent().then(t=>t.includes('취소')))throw Error('cancel missing');
  await page.locator('#precise-run').click();await page.waitForFunction(()=>!document.querySelector('.precise-dialog'),{},{timeout:20000});
  if(await page.locator('#precise-clear').isDisabled())throw Error('precise calibration not applied: '+await page.locator('#precise-status').textContent());
  await page.screenshot({path:artifactPath('speechboard-precise-ready.png'),fullPage:true});
  // Indistinguishable targets must not replace a usable previous model.
  await page.evaluate(()=>gazeTest.bad=true);await page.locator('#precise-run').click();
  await page.waitForFunction(()=>!document.querySelector('.precise-dialog'),{},{timeout:20000});
  if(!await page.locator('#precise-status').textContent().then(t=>t.includes('부족')))throw Error('weak calibration called successful');
  await page.evaluate(()=>gazeTest.bad=false);
  await page.locator('#eye-method').selectOption('iris');await page.locator('#focus-mode').uncheck();await page.locator('#start').click();
  await page.waitForTimeout(3500);
  await page.evaluate(()=>gazeTest.closed=true);await page.waitForTimeout(1300);
  if(!await page.locator('#pill-text').textContent().then(t=>t.includes('눈 감김')))throw Error('blink not excluded');
  await page.evaluate(()=>{gazeTest.closed=false;gazeTest.frozen=true;});await page.waitForTimeout(1100);
  if(!await page.locator('#pill-text').textContent().then(t=>t.includes('영상 정지')))throw Error('stale frame not excluded');
  await page.evaluate(()=>gazeTest.frozen=false);await page.waitForTimeout(500);
  await page.locator('#end-answer').click();await page.locator('#review-time').waitFor();
  const review=await page.evaluate(()=>({r:app.lastReview.review,c:app.lastReview.settings.calib,method:app.lastReview.settings.eyeMethod}));
  if(review.c.kind!=='precise'||review.method!=='iris')throw Error('calibration lost before practice');
  if(!review.r.gazeReasons['eyes-closed']||!review.r.gazeReasons.stale)throw Error('excluded intervals missing from review');
  if(review.r.gazeUnknownSec<2)throw Error('invalid time counted as frontal');
  await page.screenshot({path:artifactPath('speechboard-gaze-review.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile review overflow');
  await page.screenshot({path:artifactPath('speechboard-gaze-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.locator('#retry').click();
  await page.locator('#calib-run').click();await page.waitForFunction(()=>!document.querySelector('#precise-run').disabled);
  if(!await page.locator('#precise-status').textContent().then(t=>t.includes('유지')))throw Error('compatible saved calibration lost');
  await page.locator('#gaze-test').click();await page.locator('#gt-start').click();
  await page.waitForFunction(()=>!document.querySelector('#gt-skip').hidden);
  // Keep a genuine held-out window for the first target, then skip the other positions.
  await page.waitForTimeout(5200);
  for(let i=0;i<20;i++) {if(!await page.locator('#gt-skip').isVisible())break;await page.locator('#gt-skip').click();}
  await page.locator('#gt-use-iris').waitFor();
  if(await page.locator('#gt-result').textContent().then(t=>t.includes('통과')))throw Error('verdict shown');
  await page.locator('#gt-use-blend').click();
  if(await page.evaluate(()=>app.settings.eyeMethod)!=='blendshape')throw Error('manual method selection lost');
  await page.screenshot({path:artifactPath('speechboard-gaze-check.png'),fullPage:true});
  await page.locator('#gt-exit').click();
  await page.locator('#calib-run').click();await page.waitForFunction(()=>!document.querySelector('#precise-run').disabled);
  await page.locator('#precise-run').click();await page.locator('.precise-dialog').waitFor();
  await page.evaluate(()=>app.go('setup'));await page.waitForFunction(()=>!document.querySelector('.precise-dialog'));
  if(!await page.evaluate(()=>gazeTest.stops>=3))throw Error('sensor lifecycle cleanup missing');
  console.log(JSON.stringify({errors,completed:'basic calibration, precise cancel/retry, weak calibration, iris practice, blink/stale exclusion, duration review, mobile, saved calibration, independent method check, exit cleanup'}));
  if(errors.length)process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
