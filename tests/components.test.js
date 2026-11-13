import { test } from 'node:test';
import assert from 'node:assert/strict';
import { button, badge, card, field, switchField, segmented, tabs, statGrid, metricCard, checklist, emptyState, dataTable, topBar } from '../js/ui/components.js';

test('button variants and escaping', () => {
  const h = button({ label: '<b>끝</b>', id: 'x', variant: 'destructive', size: 'sm' });
  assert.match(h, /class="btn"/); assert.match(h, /data-variant="destructive"/); assert.match(h, /data-size="sm"/);
  assert.match(h, /id="x"/); assert.ok(h.includes('&lt;b&gt;끝&lt;/b&gt;')); assert.match(h, /type="button"/);
});

test('badge', () => {
  assert.match(badge({ label: '질문', variant: 'secondary' }), /<span class="badge" data-variant="secondary">질문<\/span>/);
});

test('card omits empty header/footer and keeps html body raw', () => {
  const h = card({ html: '<p id="raw">본문</p>' });
  assert.ok(!h.includes('<header>')); assert.ok(!h.includes('<footer>')); assert.ok(h.includes('<p id="raw">'));
  assert.match(card({ title: 'T', description: '<i>', html: '' }), /<header><h2>T<\/h2><p>&lt;i&gt;<\/p><\/header>/);
});

test('field links label and control', () => {
  const h = field({ label: '질문', forId: 'question', controlHtml: '<textarea id="question"></textarea>', hint: '도움말' });
  assert.match(h, /<div class="field"><label class="label" for="question">질문<\/label><textarea id="question"><\/textarea><p class="hint">도움말<\/p><\/div>/);
});

test('switchField is a Basecoat switch', () => {
  const h = switchField({ id: 'record-answer', label: '녹화', checked: true });
  assert.match(h, /class="input" type="checkbox" role="switch" id="record-answer" checked/);
});

test('tabs: only the selected panel is visible', () => {
  const h = tabs({ id: 'memo', selected: 'here', items: [{ id: 'here', label: '현재 위치', html: 'A' }, { id: 'all', label: '전체 복기', html: 'B' }] });
  assert.match(h, /id="memo-tab-here"[^>]*aria-selected="true"/); assert.match(h, /id="memo-tab-all"[^>]*aria-selected="false"/);
  assert.match(h, /id="memo-panel-all"[^>]*hidden/); assert.ok(!/id="memo-panel-here"[^>]*hidden/.test(h));
});

test('segmented marks the chosen value', () => {
  const h = segmented({ name: 'preset', value: 'interview', options: [{ value: 'class', label: '수업' }, { value: 'interview', label: '면접' }] });
  assert.match(h, /data-value="interview"[^>]*aria-selected="true"/); assert.match(h, /data-value="class"[^>]*aria-selected="false"/);
});

test('topBar marks current step and keeps the actions slot', () => {
  const h = topBar({ step: 'report' });
  assert.match(h, /aria-current="step">분석</); assert.match(h, /id="topbar-right"/);
});

test('metricCard is neutral and keeps ids', () => {
  const h = metricCard({ id: 'p-rate', title: '말하기 속도', numId: 'v-rate', stateId: 'l-rate' });
  assert.match(h, /id="p-rate"[^>]*data-status="idle"|data-status="idle"[^>]*id="p-rate"/); assert.match(h, /id="v-rate"/); assert.match(h, /id="l-rate"/);
});

test('statGrid / dataTable / emptyState / checklist escape text', () => {
  assert.ok(statGrid([{ label: '<x>', value: '82%' }]).includes('&lt;x&gt;'));
  assert.match(dataTable({ columns: ['시작'], rowsHtml: ['<tr><td>0:34</td></tr>'] }), /<table class="table">/);
  assert.ok(emptyState({ title: '녹화 없음', text: '<a>' }).includes('&lt;a&gt;'));
  assert.match(checklist([{ key: 'face', title: '정면' }]), /<li data-step="face">/);
});
