// REALHOST-1: hosted in a cross-origin NakliOS iframe with fs:false, Mantra must not call
// showDirectoryPicker (it throws there) and must show the "connect storage in NakliOS" hint.
//
// Stand-in host harness: the REAL vendored SDK block runs in a vm context whose window has a
// fake parent. The parent answers the SDK wire (capabilities-request, fs:* rpc) from a Map.
// The app's folder functions are sliced out of index.html verbatim and run against it.
//
// `--html <path>` runs against another copy of index.html (used by the mutant check).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argi = process.argv.indexOf('--html');
const htmlPath = argi > 0 ? path.resolve(process.argv[argi + 1]) : path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const sdk = html.match(/\/\* naklios-sdk:begin[^\n]*\*\/([\s\S]*?)\/\* naklios-sdk:end \*\//);
assert.ok(sdk, 'vendored SDK block found');

// Slice a top-level declaration (function or const) out of the app source, braces balanced.
function slice(name) {
  const re = new RegExp(`^(?:async )?function ${name}\\(|^const ${name} =`, 'm');
  const m = re.exec(html);
  assert.ok(m, `declaration ${name} found`);
  if (html.startsWith('const', m.index)) return html.slice(m.index, html.indexOf('\n', m.index));
  let i = html.indexOf('{', html.indexOf(')', m.index)), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return html.slice(m.index, i + 1);
}
const appNames = ['nakliosFsAvailable', 'NAKLIOS_RUNS_DIR', 'canPickFolder', 'needsNakliOSStorage',
  'NAKLIOS_CONNECT_HINT', 'nakliosStorageLabel', 'exportRunsToFolder', 'importRunsFromFolder',
  'exportRunsToNakliOS', 'importRunsFromNakliOS'];
const appSrc = appNames.map(slice).join('\n');

const tick = () => new Promise(r => setTimeout(r, 0));

// mode: 'standalone' | 'cross-origin' | 'same-origin'; fsOn: host grants naklios.fs.
async function boot({ mode, fsOn }) {
  const listeners = [];
  const log = { picker: 0, toasts: [], sent: [] };
  const store = new Map();
  const win = {
    location: { search: mode === 'standalone' ? '' : '?naklios' },
    addEventListener: (t, cb) => { if (t === 'message') listeners.push(cb); },
    showDirectoryPicker: async () => { log.picker++; throw new Error('SecurityError: cross-origin'); },
    console, setTimeout, clearTimeout, Promise, URLSearchParams, JSON, Object, Array, String, Map, Set, Date, Error,
  };
  const deliver = data => listeners.forEach(cb => cb({ data, source: win.parent, origin: 'https://naklios.dev' }));
  if (mode === 'standalone') win.parent = win;
  else {
    win.parent = {
      postMessage(msg) {
        log.sent.push(msg.type);
        queueMicrotask(() => {
          if (msg.type === 'naklios:capabilities-request') {
            deliver({ type: 'naklios:capabilities', fs: fsOn, fsBackends: fsOn ? [{ id: 'folder', label: 'Folder' }] : [],
              fsBackend: fsOn ? 'folder' : null, system: false, sysFs: false, ai: false, net: false });
          } else if (msg.type === 'naklios:fs:write') {
            store.set(msg.path, msg.data);
            deliver({ type: 'naklios:fs:reply', requestId: msg.requestId, result: true });
          } else if (msg.type === 'naklios:fs:list') {
            deliver({ type: 'naklios:fs:reply', requestId: msg.requestId, result: [...store.keys()] });
          }
        });
      },
    };
    const loc = { href: 'https://naklios.dev/' };
    Object.defineProperty(win.parent, 'location', {
      get() { if (mode === 'cross-origin') throw new Error('SecurityError: cross-origin frame'); return loc; },
    });
  }
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(sdk[1], ctx, { filename: 'naklios-sdk' });
  Object.assign(win, {
    toast: (msg, kind) => log.toasts.push({ msg, kind }),
    listRuns: async () => [{ id: 'run1', prompt: 'hi' }],
    saveRun: async () => {},
    renderHistory: () => {},
  });
  vm.runInContext(appSrc + '\nthis.__app = { exportRunsToFolder, importRunsFromFolder, needsNakliOSStorage, NAKLIOS_CONNECT_HINT };', ctx);
  win.naklios.requestCapabilities();
  await tick(); await tick();
  return { app: win.__app, log, store, win };
}

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('  ok -', name); };

await t('cross-origin + fs:false: export calls no picker and shows the hint', async () => {
  const { app, log, win } = await boot({ mode: 'cross-origin', fsOn: false });
  assert.equal(win.naklios.capabilities.hosted, true);
  assert.equal(win.naklios.capabilities.fs, false);
  await app.exportRunsToFolder();
  assert.equal(log.picker, 0, 'showDirectoryPicker must not be called');
  assert.deepEqual(log.toasts, [{ msg: app.NAKLIOS_CONNECT_HINT, kind: 'err' }]);
  assert.match(app.NAKLIOS_CONNECT_HINT, /Connect a Folder or Crate in NakliOS/);
});

await t('cross-origin + fs:false: import calls no picker and shows the hint', async () => {
  const { app, log } = await boot({ mode: 'cross-origin', fsOn: false });
  await app.importRunsFromFolder();
  assert.equal(log.picker, 0, 'showDirectoryPicker must not be called');
  assert.deepEqual(log.toasts, [{ msg: app.NAKLIOS_CONNECT_HINT, kind: 'err' }]);
});

await t('cross-origin + fs:true: export goes through naklios.fs, no picker', async () => {
  const { app, log, store } = await boot({ mode: 'cross-origin', fsOn: true });
  await app.exportRunsToFolder();
  assert.equal(log.picker, 0);
  assert.ok(store.has('runs/run1.json'), 'run written through the host');
  assert.match(log.toasts[0].msg, /Exported 1 run to Folder/);
});

await t('same-origin mirror + fs:false: picker is still used (no hint)', async () => {
  const { app, log } = await boot({ mode: 'same-origin', fsOn: false });
  assert.equal(app.needsNakliOSStorage(), false);
  await app.exportRunsToFolder();
  assert.equal(log.picker, 1);
  assert.equal(log.toasts.length, 0);
});

await t('standalone: picker is used (no hint)', async () => {
  const { app, log } = await boot({ mode: 'standalone', fsOn: false });
  assert.equal(app.needsNakliOSStorage(), false);
  await app.importRunsFromFolder();
  assert.equal(log.picker, 1);
  assert.equal(log.toasts.length, 0);
});

console.log(`hosted folder picker: ${pass}/5 ok`);
