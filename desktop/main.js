// 마비노기 포트레이트 위젯 — 테두리 없는 창 / 항상 위 / 드래그 이동 / 캐릭터별 실행
//   실행:  electron desktop --char=<캐릭터ID>        (여러 명: --chars=a,b,c)
//   옵션:  --width=920   --selftest(점검 후 종료)
//   이동: 배경·캐릭터·대사창 빈 곳을 끌기 / 오른쪽 클릭(어디서든): 메뉴 / 가장자리: 크기 조절
const { app, BrowserWindow, Menu, screen, ipcMain, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');            // index.html, characters/, fonts/, assets/ 가 있는 프로젝트 폴더
const ALLOWED = ['index.html', 'characters', 'fonts', 'assets'];
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const RATIO = 1840 / 982;
const VERSION = require('./package.json').version;
const CONTACT_URL = 'https://x.com/mabi_hp_sphie';   // 수정/업데이트 요청 · 제보 (고정 주소만 엽니다)
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;   // 캐릭터 ID로 허용하는 문자 (폴더 이름과 같음)

function arg(name) {
  const a = process.argv.find(x => x === '--' + name || x.startsWith('--' + name + '='));
  if (!a) return null;
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const i = process.argv.indexOf(a); const nx = process.argv[i + 1];
  return nx && !nx.startsWith('--') ? nx : true;
}

// 프로젝트 폴더를 http://127.0.0.1 로 보여주는 작은 서버 (배포 사이트와 똑같이 동작하게 함)
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = '/';
      try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { /* ignore */ }
      if (p === '/') p = '/index.html';
      const top = p.split('/').filter(Boolean)[0];
      const file = path.normalize(path.join(ROOT, p));
      // 이 PC 안(127.0.0.1)에서만 열리는 서버: 다른 호스트 이름으로 접근(DNS rebinding)하거나 허용 폴더 밖으로 나가는 경로는 막는다
      if (!/^127\.0\.0\.1(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end('forbidden'); }
      if (!ALLOWED.includes(top) || !(file === ROOT || file.startsWith(ROOT + path.sep))) { res.writeHead(403); return res.end('forbidden'); }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        const base = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
        // 음악 파일의 전체 길이 표시와 재생 위치 이동(탐색)을 위해 Content-Length 와 Range 요청을 지원한다
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (m && (m[1] !== '' || m[2] !== '')) {
          let start = m[1] === '' ? Math.max(0, st.size - parseInt(m[2], 10)) : parseInt(m[1], 10);
          let end = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(parseInt(m[2], 10), st.size - 1);
          if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
          res.writeHead(206, Object.assign(base, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 }));
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, Object.assign(base, { 'Content-Length': st.size }));
        fs.createReadStream(file).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// 창 위치/크기 기억 (캐릭터별)
const stateFile = () => path.join(app.getPath('userData'), 'widgets.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } };
const saveState = st => { try { fs.writeFileSync(stateFile(), JSON.stringify(st)); } catch (e) { /* ignore */ } };

function listCharacters() {
  try {
    return fs.readdirSync(path.join(ROOT, 'characters'), { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, 'characters', d.name, 'character.json'))).map(d => d.name);
  } catch (e) { return []; }
}

// 화면 높이 늘리기 설정이 바뀌면 창 비율도 바꾸고, 아래쪽은 고정한 채 위로 늘린다
const fromOurPage = ev => { try { return ev.senderFrame.url.startsWith('http://127.0.0.1:' + PORT + '/'); } catch (e) { return false; } };
ipcMain.on('widget-ratio', (ev, r) => {
  const win = BrowserWindow.fromWebContents(ev.sender); if (!fromOurPage(ev) || !win || win.isDestroyed() || typeof r !== 'number' || !(r > 0.5 && r < 4)) return;
  if (Math.abs((win._ratio || 0) - r) < 1e-4) return;
  win._ratio = r; win.setAspectRatio(r);
  const b = win.getBounds(), nh = Math.round(b.width / r);
  win.setBounds({ x: b.x, y: b.y + b.height - nh, width: b.width, height: nh });
});

// 페이지에서 보내는 드래그 이동 요청 (테두리가 없어서 직접 옮겨 줌)
ipcMain.on('widget-move', (ev, dx, dy) => {
  const win = BrowserWindow.fromWebContents(ev.sender); if (!fromOurPage(ev) || !win || win.isDestroyed() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = win.getPosition(); win.setPosition(x + Math.round(dx), y + Math.round(dy));
});

let PORT = 0;
const windows = new Set();

function createWidget(id, cascade) {
  const st = loadState(), saved = st[id];
  const wantW = parseInt(arg('width'), 10);
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.max(320, Math.round((saved && saved.w) || wantW || 920));
  const ratio0 = (saved && saved.r) || RATIO;
  const h = Math.round(w / ratio0);
  const opts = { width: w, height: h, frame: false, resizable: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#000000',
    title: id, autoHideMenuBar: true, show: !arg('selftest'),
    x: saved ? saved.x : wa.x + wa.width - w - 40 - cascade * 40, y: saved ? saved.y : wa.y + wa.height - h - 40 - cascade * 40,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' } };
  const win = new BrowserWindow(opts);
  win._ratio = ratio0;
  win.setAspectRatio(ratio0);
  // 외부 페이지로 이동하거나 새 창이 열리지 않게 고정
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith('http://127.0.0.1:' + PORT + '/')) e.preventDefault(); });
  win.setAlwaysOnTop(true, 'screen-saver');
  windows.add(win);
  win.on('closed', () => windows.delete(win));

  const remember = () => { if (win.isDestroyed()) return; const b = win.getBounds(); const s2 = loadState(); s2[id] = Object.assign({}, s2[id], { x: b.x, y: b.y, w: b.width, h: b.height, r: win._ratio }); saveState(s2); };
  let t = null; const later = () => { clearTimeout(t); t = setTimeout(remember, 400); };
  win.on('move', later); win.on('resize', later);

  // 오른쪽 클릭 메뉴
  const setWidth = ww => { const b = win.getBounds(); win.setBounds({ x: b.x, y: b.y, width: ww, height: Math.round(ww / win._ratio) }); };
  let barOn = !!(saved && saved.bar);
  const applyBar = () => { if (!win.isDestroyed()) win.webContents.executeJavaScript("document.body.classList.toggle('showbar'," + barOn + ")").catch(() => {}); };
  win.webContents.on('did-finish-load', applyBar);
  const showMenu = () => {
    Menu.buildFromTemplate([
      { label: '항상 위', type: 'checkbox', checked: win.isAlwaysOnTop(), click: m => win.setAlwaysOnTop(m.checked, 'screen-saver') },
      { label: '재생바 표시 (마우스 올릴 때)', type: 'checkbox', checked: barOn, click: m => { barOn = m.checked; applyBar(); const s2 = loadState(); s2[id] = Object.assign({}, s2[id], { bar: barOn }); saveState(s2); } },
      { label: '크기', submenu: [['작게 (640)', 640], ['보통 (920)', 920], ['크게 (1280)', 1280], ['아주 크게 (1600)', 1600]].map(([label, ww]) => ({ label, click: () => setWidth(ww) })) },
      { label: '투명도', submenu: [100, 85, 70, 50].map(p => ({ label: p + '%', type: 'radio', checked: Math.round(win.getOpacity() * 100) === p, click: () => win.setOpacity(p / 100) })) },
      { label: '화면 오른쪽 아래로 이동', click: () => { const b = win.getBounds(); win.setPosition(wa.x + wa.width - b.width - 40, wa.y + wa.height - b.height - 40); } },
      { type: 'separator' },
      { label: '마비노기 포트레이트 위젯 v' + VERSION, enabled: false },
      { label: '수정 요청 · 제보: X @mabi_hp_sphie', click: () => shell.openExternal(CONTACT_URL) },
      { type: 'separator' },
      { label: '닫기', click: () => win.close() }
    ]).popup({ window: win });
  };
  win.webContents.on('context-menu', showMenu);   // 위젯 어디서든 오른쪽 클릭

  win.loadURL('http://127.0.0.1:' + PORT + '/index.html?c=' + encodeURIComponent(id) + '&widget=1');
  return win;
}

app.whenReady().then(async () => {
  PORT = await startServer();
  let ids = [];
  const one = arg('char'), many = arg('chars');
  if (typeof many === 'string') ids = many.split(',').map(s => s.trim()).filter(Boolean);
  else if (typeof one === 'string') ids = [one];
  ids = ids.filter(i => ID_RE.test(i));
  if (!ids.length) { const all = listCharacters(); ids = all.length ? [all[0]] : []; }
  if (!ids.length) { console.error('characters/ 폴더에 캐릭터가 없습니다. 편집기에서 “프로젝트 폴더에 저장”을 먼저 하세요.'); app.quit(); return; }

  if (arg('selftest')) {          // 점검 모드: 창을 숨긴 채 로딩만 확인하고 종료
    const win = createWidget(ids[0], 0);
    win.webContents.on('did-fail-load', (e, code, desc) => { console.log('SELFTEST FAIL load:', code, desc); app.exit(1); });
    win.webContents.on('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 2500));
      const info = await win.webContents.executeJavaScript(`JSON.stringify({
        bodyClass: document.body.className, name: document.getElementById('nm').textContent,
        text: document.getElementById('tx').textContent.slice(0,40), stage: !!document.getElementById('stage'),
        editorHidden: getComputedStyle(document.querySelector('.editor')).display==='none',
        mode: window.__widgetDrag, bridge: typeof window.widgetBridge, bgm: window.__bgm ? [window.__bgm.duration, window.__bgm.seekable.length, window.__bgm.readyState] : null, imgDrag: getComputedStyle(document.getElementById('base')).webkitUserDrag })`);
      await win.webContents.executeJavaScript("(function(){ if(window.__bgm){ window.__bgm.currentTime=60; } })()"); await new Promise(r => setTimeout(r, 800));
      const seekTo = await win.webContents.executeJavaScript("window.__bgm ? window.__bgm.currentTime : null");
      console.log('SEEK', JSON.stringify({ requested: 60, now: seekTo }));
      console.log('SELFTEST OK', info, JSON.stringify({ aot: win.isAlwaysOnTop(), frameless: !win.isMenuBarVisible(), bounds: win.getBounds() }));
      // 드래그 흉내: 캐릭터 이미지에서 pointerdown → pointermove 로 창이 움직이는지 확인
      const p0 = win.getPosition();
      await win.webContents.executeJavaScript(`(function(){ var t=document.getElementById('base'); function ev(type,x,y){ return new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,button:0,screenX:x,screenY:y,clientX:300,clientY:100}); } t.dispatchEvent(ev('pointerdown',500,400)); for(var i=1;i<=6;i++) document.dispatchEvent(ev('pointermove',500+i*10,400+i*5)); document.dispatchEvent(ev('pointerup',560,430)); })()`);
      await new Promise(r => setTimeout(r, 400));
      const p1 = win.getPosition();
      console.log('DRAG moved', JSON.stringify([p1[0] - p0[0], p1[1] - p0[1]]));
      app.quit();
    });
    return;
  }
  ids.forEach((id, i) => createWidget(id, i));
});

app.on('window-all-closed', () => app.quit());
