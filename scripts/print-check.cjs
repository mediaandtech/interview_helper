// 복기 화면 인쇄 점검: 숨겨진 메모 탭도 인쇄되고, 카드 글자가 흰 종이에서 읽혀야 함
const {launchBrowser}=require('./browser-support.cjs');
(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto((process.env.REVIEW_URL || 'http://127.0.0.1:8081') + '/?demo=1');
  await page.waitForTimeout(4500);
  await page.getByRole('button', { name: '모니터링 끝내기 (Esc)' }).click();
  await page.locator('#review-time').waitFor();
  await page.getByRole('tab', { name: '전체 메모' }).click();
  await page.locator('#reflection').fill('인쇄될 전체 메모');
  await page.getByRole('tab', { name: '현재 위치' }).click();   // 전체 메모 패널을 다시 숨김
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const note = document.querySelector('.print-note');
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return (r + g + b) / 3; };
    return {
      notePrinted: !!note && note.getBoundingClientRect().height > 0 && note.textContent === '인쇄될 전체 메모',
      cardText: lum(getComputedStyle(document.querySelector('.card h2')).color),
      statText: lum(getComputedStyle(document.querySelector('.stat-value')).color),
    };
  });
  await browser.close();
  const fails = [];
  if (!r.notePrinted) fails.push('hidden-tab memo not printed');
  if (r.cardText > 128 || r.statText > 128) fails.push(`card text too light on paper (${r.cardText}, ${r.statText})`);
  console.log(JSON.stringify(r));
  if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
  console.log('PASS');
})();
