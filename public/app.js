const ROWS = [['trigger', 'Trigger'], ['context', 'Context'], ['decisions', 'Decisions'], ['actions', 'Actions'], ['exceptions', 'Exceptions']];
const STAGES = ['task', 'trigger', 'context', 'decisions', 'actions', 'exceptions', 'owners', 'shelf', 'test', 'complete'];
const OWNERS = {'': '—', ai: 'AI does it', approve: 'You approve', you: 'You own it'};
const NEXT_OWNER = {'': 'ai', ai: 'approve', approve: 'you', you: 'ai'};
const OPENING = 'What is one task you would like off your plate? And what does finished look like?';

// The GitHub Pages copy is replay-only since the workshop ended; a local copy talks to its own server
const API = location.hostname.endsWith('github.io') ? null : './';
const store = {get: k => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }};
const $ = s => document.querySelector(s);
const log = $('#log'), answer = $('#answer'), send = $('#send'), error = $('#error'), status = $('#status');

let state, replay = null, busy = false, run = 0, online = true;

function blankMap() {
  return {task: '', done: '', rows: Object.fromEntries(ROWS.map(([k]) => [k, {text: '', owner: '', reason: ''}])), tools: '', shelf: '', gaps: '', test: '', success: ''};
}
// Row text holds several items as "a; b; c". On screen each item gets its own line.
const isRow = key => /^rows\.\w+\.text$/.test(key);
const items = v => v.split(/\s*;\s*/).filter(Boolean);
function toLines(v) { const list = items(v); return list.length > 1 ? list.map(i => '• ' + i).join('\n') : v; }
function fillRow(el, v) {
  const list = items(v);
  if (list.length < 2) { el.textContent = v; return; }
  el.replaceChildren(...list.map(i => { const s = document.createElement('span'); s.className = 'item'; s.textContent = i; return s; }));
}
const fromLines = t => t.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).join('; ');
const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
function set(obj, key, value) { const parts = key.split('.'); const last = parts.pop(); parts.reduce((o, k) => o[k], obj)[last] = value; }

// Build the five rows once; render() only updates them
$('#rows').innerHTML = ROWS.map(([k, name]) => `
  <div class="row">
    <span class="row-name">${name}</span>
    <p class="value" data-key="rows.${k}.text" contenteditable="plaintext-only" spellcheck="false"></p>
    <button type="button" class="owner" data-key="rows.${k}.owner" data-owner="" aria-label="${name} owner. Click to change."></button>
    <p class="reason" data-key="rows.${k}.reason"></p>
  </div>`).join('');

function reset() {
  run++; busy = false; send.disabled = false;
  state = {messages: [{role: 'assistant', content: OPENING}], map: blankMap(), locked: new Set(), stage: 'task'};
  log.innerHTML = ''; error.textContent = '';
  addMessage('ai', OPENING);
  render(false);
  answer.value = ''; answer.focus();
}

function addMessage(who, text) {
  const el = document.createElement('p');
  el.className = `msg ${who}`; el.textContent = text;
  log.append(el); requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return el;
}

function render(flash = true) {
  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.dataset.key, value = get(state.map, key) ?? '';
    el.classList.toggle('locked', state.locked.has(key));
    if (el.classList.contains('owner')) {
      if (el.dataset.owner !== value && flash) pulse(el);
      el.dataset.owner = value; el.textContent = OWNERS[value];
      el.title = get(state.map, key.replace('.owner', '.reason')) ?? '';
      return;
    }
    if (document.activeElement === el || el.dataset.value === value) return;
    el.dataset.value = value;
    if (isRow(key)) { fillRow(el, value); el.classList.toggle('multi', items(value).length > 2); }
    else el.textContent = value;
    if (flash && value) { pulse(el); el.scrollIntoView({block: 'nearest', behavior: 'smooth'}); }
  });
  const at = STAGES.indexOf(state.stage);
  document.querySelectorAll('#stages li').forEach(li => {
    const i = STAGES.indexOf(li.dataset.stage);
    li.classList.toggle('done', i < at); li.classList.toggle('current', i === at);
    li.toggleAttribute('aria-current', i === at);
  });
  $('#map-actions').hidden = state.stage !== 'complete';
}
function pulse(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

// Presenter edits win over the AI: lock the field so the next turn keeps it
document.addEventListener('input', e => {
  const key = e.target.dataset?.key;
  if (!key || !e.target.isContentEditable) return;
  const v = isRow(key) ? fromLines(e.target.innerText) : e.target.innerText.trim();
  set(state.map, key, v); e.target.dataset.value = v; state.locked.add(key); e.target.classList.add('locked');
});
$('#rows').addEventListener('click', e => {
  const btn = e.target.closest('.owner'); if (!btn) return;
  const key = btn.dataset.key, reasonKey = key.replace('.owner', '.reason');
  set(state.map, key, NEXT_OWNER[get(state.map, key)]); set(state.map, reasonKey, 'Set by you.');
  state.locked.add(key); state.locked.add(reasonKey);
  render();
});

function applyMap(next) {
  const merged = structuredClone(next);
  for (const key of state.locked) set(merged, key, get(state.map, key));
  state.map = merged;
}

async function submit() {
  // In replay, Enter always sends the full recorded answer, even mid-typing
  const text = (replay?.steps[replay.i]?.user ?? answer.value).trim();
  if (!text || busy) return;
  if (!replay && !online) { error.textContent = 'This copy has no AI connection. Click Replay example to play the recorded interview.'; return; }
  busy = true; send.disabled = true; error.textContent = '';
  const mine = run;
  const bubble = addMessage('user', text); answer.value = '';
  state.messages.push({role: 'user', content: text});
  const thinking = addMessage('ai thinking', ''); thinking.innerHTML = '<span></span><span></span><span></span>';
  try {
    const out = replay ? await replayTurn() : await liveTurn();
    if (mine !== run) return; // Start over was pressed while this turn was in flight
    thinking.remove();
    addMessage('ai', out.say);
    state.messages.push({role: 'assistant', content: out.say});
    state.stage = out.stage; applyMap(out.map); render();
    if (replay) primeReplay();
  } catch (e) {
    if (mine !== run) return;
    thinking.remove(); bubble.remove(); state.messages.pop();
    answer.value = text; error.textContent = e.message;
  } finally { if (mine === run) { busy = false; send.disabled = false; answer.focus(); } }
}

async function liveTurn() {
  const res = await fetch(API + 'api/turn', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Presenter-Code': store.get('presenter-code')},
    body: JSON.stringify({messages: state.messages, map: state.map, locked: [...state.locked]})})
    .catch(() => { throw new Error('Could not reach the AI. Press Enter to try again, or use Replay example.'); });
  const out = await res.json().catch(() => ({error: 'The server sent back something unreadable.'}));
  if (out.needCode) { store.set('presenter-code', ''); askForCode(); }
  if (!res.ok) throw new Error(out.error ?? 'Something went wrong. Try again.');
  return out;
}

// Replay: a recorded run that plays back with no network, for when the connection stalls
async function replayTurn() {
  const step = replay.steps[replay.i++];
  if (!step) throw new Error('The replay is finished. Click Start over to go live.');
  await new Promise(r => setTimeout(r, 1100 + Math.random() * 700));
  return step;
}
function primeReplay() {
  const step = replay.steps[replay.i];
  if (!step) return;
  let n = 0; answer.value = '';
  const type = () => { if (!replay || busy || answer.value.length >= step.user.length) return; answer.value = step.user.slice(0, n += 3); setTimeout(type, 18); };
  setTimeout(type, 500);
}
async function startReplay() {
  try {
    const data = await fetch('./replay.json').then(r => r.json());
    reset(); replay = {steps: data.steps, i: 0};
    status.className = 'status replay'; status.textContent = 'Replay · offline';
    primeReplay();
  } catch { error.textContent = 'The replay file is missing.'; }
}

function planText() {
  const m = state.map;
  const rows = ROWS.map(([k, name]) => `${name}: ${(m.rows[k].text || '—').split(/\s*;\s*/).join('\n    ')}\n  Owner: ${OWNERS[m.rows[k].owner]}${m.rows[k].reason ? ` (${m.rows[k].reason})` : ''}`).join('\n');
  return `AGENT PLAN: ${m.task}
Done looks like: ${m.done}

${rows}

Tools I already have: ${m.tools || '—'}
Off the shelf: ${m.shelf || '—'}
Left to build: ${m.gaps || '—'}
First test: ${m.test || '—'}
Pass if: ${m.success || '—'}

PROMPT TO START BUILDING
Here is my agent plan (above). Walk me through setting up the first version one step at a time, starting with the trigger. Use the tools I already have first, then an off-the-shelf option, and build only what neither covers. Anything marked "You approve" stays a draft for me to review. Stop and ask me before anything that sends, deletes, or spends money. Check current documentation for each tool rather than guessing.`;
}

$('#ask').addEventListener('submit', e => { e.preventDefault(); submit(); });
answer.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
$('#reset').addEventListener('click', () => { replay = null; checkStatus(); reset(); });
$('#replay').addEventListener('click', startReplay);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function renderPlan() {
  const m = state.map, root = $('#plan-body'); root.replaceChildren();
  const head = el('div', 'plan-goal');
  head.append(el('p', 'plan-task', m.task || '—'), el('p', 'plan-done', 'Done looks like: ' + (m.done || '—')));
  const table = el('div', 'plan-rows');
  for (const [k, name] of ROWS) {
    const r = m.rows[k], row = el('div', 'plan-row');
    const chip = el('span', 'owner', OWNERS[r.owner]); chip.dataset.owner = r.owner;
    const text = el('p', 'plan-text'); fillRow(text, r.text || '—'); text.classList.toggle('multi', items(r.text).length > 2);
    const what = el('div', 'plan-what'); what.append(text, el('p', 'plan-why', r.reason));
    row.append(el('span', 'row-name', name), what, chip); table.append(row);
  }
  const facts = el('div', 'plan-facts');
  for (const [label, value] of [['Already have', m.tools], ['Off the shelf', m.shelf], ['Left to build', m.gaps], ['First test', (m.test || '—') + (m.success ? ' Pass if: ' + m.success : '')]]) {
    const f = el('div', 'fact'); f.append(el('span', 'label', label), el('p', null, value || '—')); facts.append(f);
  }
  const prompt = el('div', 'plan-prompt');
  prompt.append(el('span', 'label', 'Paste with the plan to start building'), el('p', null, planText().split('PROMPT TO START BUILDING\n')[1]));
  root.append(head, table, facts, prompt);
}
$('#show-plan').addEventListener('click', () => { renderPlan(); $('#plan-dialog').showModal(); });
$('#copy-plan-dialog').addEventListener('click', e => copyPlan(e.target));
$('#close-plan').addEventListener('click', () => $('#plan-dialog').close());
async function copyPlan(btn) {
  try { await navigator.clipboard.writeText(planText()); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}
$('#copy-plan').addEventListener('click', e => copyPlan(e.target));

function askForCode() {
  const box = $('#code'); box.hidden = false; box.value = '';
  status.className = 'status off'; status.textContent = 'Enter the presenter code';
}
$('#code').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  store.set('presenter-code', e.target.value.trim()); e.target.hidden = true;
  status.className = 'status ok'; status.textContent = 'AI ready'; error.textContent = ''; answer.focus();
});
async function checkStatus() {
  try {
    if (!API) throw new Error('replay-only copy');
    const s = await fetch(API + 'api/status').then(r => r.json());
    online = s.ready;
    status.className = `status ${s.ready ? 'ok' : 'off'}`;
    status.textContent = s.ready ? 'AI ready' : 'AI offline · use replay';
    if (s.ready && s.codeRequired && !store.get('presenter-code')) askForCode();
  } catch {
    // No server behind this page (a static hosted copy): replay only
    online = false; status.className = 'status off'; status.textContent = 'Replay-only copy · click Replay example';
  }
}

reset();
checkStatus();
