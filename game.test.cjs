const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

// Exercise the real game script with a small DOM/canvas substitute and a controlled clock.
function boot({recordDraws=false}={}) {
  const ids = new Map(), events = {}, intervals = new Map();
  let document, timerId = 0, now = 0;
  const drawCalls=[];
  const ctx = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : (...args) => {if(recordDraws)drawCalls.push({method:key,args})} });
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attrs = {};
      this.hidden = false; this.disabled = false; this.isConnected = true; this.clientWidth = 1280; this.clientHeight = 720;
      const classes = new Set();
      this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: v => classes.has(v), toggle: (v, on) => on ? classes.add(v) : classes.delete(v) };
    }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    set innerHTML(value) {
      this._html = value; this.children = [];
      for (const match of value.matchAll(/<(button|canvas|div)\b([^>]*)>/g)) {
        const el = new Element(match[1]), id = match[2].match(/id="([^"]+)"/);
        if (id) el.id = id[1]; this.append(el);
      }
    }
    get innerHTML() { return this._html || ''; }
    set className(value) { value.split(' ').forEach(x => this.classList.add(x)); }
    append(...els) { els.forEach(el => { el.parentElement = this; this.children.push(el); }); }
    replaceChildren(...els) { this.children = []; this.append(...els); }
    querySelectorAll(selector) {
      const all = this.children.flatMap(el => [el, ...el.querySelectorAll('*')]);
      return selector === '*' ? all : all.filter(el => el.tagName === 'BUTTON' && (!selector.includes(':not') || !el.disabled));
    }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    focus() { document.activeElement = this; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(k, fn) { (this.events ||= {})[k] = fn; }
    closest() { return this.tagName === 'BUTTON' ? this : null; }
    getContext() { return ctx; }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const el = new Element(match[1]); el.id = match[3];
    const cl = match[2].match(/class="([^"]+)"/); if (cl) el.className = cl[1];
  }
  ids.get('nav').append(new Element('button'));
  ids.get('pauseActions').append(ids.get('resume'), ids.get('pauseSound'), ids.get('leaveGame'));
  ids.get('pause').append(ids.get('pauseActions'), ids.get('leaveConfirm'));
  ids.get('g').append(...['cv', 'mg', 'dlg', 'pauseButton', 'pause'].map(id => ids.get(id)));
  document = {
    body: new Element(), documentElement: new Element(), activeElement: ids.get('cv'), fullscreenElement: {},
    getElementById: id => ids.get(id), createElement: tag => new Element(tag),
    querySelectorAll: selector => selector === '.scr' ? [...ids.values()].filter(el => el.classList.contains('scr')) : [],
    querySelector: () => ids.get('nav').children[0], addEventListener: (k, fn) => { events[k] = fn; }
  };
  const sandbox = { document, window: {}, screen: {}, innerWidth: 1280, innerHeight: 720, console,
    localStorage: { getItem: () => '{}', setItem() {} }, Image: class {}, requestAnimationFrame() {},
    addEventListener: (k, fn) => { (events[k] ||= []).push(fn); }, setTimeout: () => ++timerId,
    setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id)
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(root, 'game.js'), 'utf8'), sandbox);
  const run = script => vm.runInContext(script, sandbox);
  return { run, ids, events, document, drawCalls,
    advance(ms) { for (let i = 0; i < ms; i += 20) { now += 20; run(`loop(${now})`); for (const fn of [...intervals.values()]) fn(); } },
    key(key, target = ids.get('cv')) { let prevented = false; for (const fn of events.keydown) fn({ key, target, repeat: false, preventDefault() { prevented = true; } }); return prevented; }
  };
}

test('progress hooks count foreground gameplay only and isolate account achievements', () => {
  const g=boot();
  g.run("var tracked=0,ended=0,awards=[];window.StudentProgress={gate:()=>true,start:()=>{},tick:n=>tracked+=n,award:k=>awards.push(k),end:()=>ended++,finish:()=>{}};startGame('ig');pending.clear()");
  g.advance(1000);const before=g.run('tracked');assert.ok(before>.9);
  g.run('setPaused(true)');g.advance(1000);assert.equal(g.run('tracked'),before);
  g.run('setPaused(false);document.hidden=true');g.advance(1000);assert.equal(g.run('tracked'),before);
  g.run("document.hidden=false;award('farm');window.setStudentAchievements({exp:1})");
  assert.equal(g.run('st'),'menu');assert.equal(g.run('ach.farm'),undefined);assert.equal(g.run('ach.exp'),1);assert.equal(g.run('awards[0]'),'farm');
  g.advance(1000);assert.equal(g.run('tracked'),before);
});

test('configured login gate blocks starting a route until account is ready',()=>{
  const g=boot();g.run("window.StudentProgress={gate:()=>false};startGame('ig')");assert.equal(g.run('st'),'menu');
});

test('Igorot introduction includes the five requested room objects',()=>{
  const g=boot();assert.deepEqual(JSON.parse(g.run('JSON.stringify(SIG[0].o.map(o=>o.n).sort())')),['Banig','Bintana','Hinabing tela','Imbakan ng pagkain','Kagamitang pansaka'].sort());
});

test('Lola has no legacy fishing-net overlay beside the supplied sprite',()=>{
  const g=boot();assert.equal(g.run('LOLO.job'),undefined);
});

test('pause freezes opening delay, movement and dialogue; resume continues', () => {
  const g = boot(); g.run("startGame('bd');setPaused(true)"); g.advance(4000);
  assert.equal(g.run('adv'), null); assert.equal(g.run('px'), 70);
  g.key('d'); g.key('e'); g.advance(1000); assert.equal(g.run('px'), 70);
  g.run('setPaused(false)'); g.advance(2800); assert.equal(g.run('typeof adv'), 'function');
  g.run('setPaused(true)'); const text = g.ids.get('dt').textContent; const time = g.run('tm');
  g.advance(1000); assert.equal(g.ids.get('dt').textContent, text); assert.equal(g.run('tm'), time);
  g.run('setPaused(false)'); g.advance(1000); assert.notEqual(g.ids.get('dt').textContent, text);
});

test('mini-game buttons, progress and completion delay survive pause', () => {
  const g = boot(); g.run("startGame('ig');pending.clear();game(SIG[3].g,()=>{busy=false})");
  let buttons = g.ids.get('mg').querySelectorAll('button');
  buttons.find(b => b.textContent === 'Ibabang terasa').onclick();
  g.run('setPaused(true)'); g.advance(2000); g.run('setPaused(false)');
  assert.equal(g.ids.get('mg').querySelectorAll('button')[0], buttons[0]);
  assert.equal(buttons.find(b => b.textContent === 'Ibabang terasa').disabled, true);
  buttons.find(b => b.textContent === 'Gitnang terasa').onclick();
  buttons.find(b => b.textContent === 'Itaas na terasa').onclick();
  g.run('setPaused(true)'); g.advance(2000); assert.equal(g.run('busy'), true);
  g.run('setPaused(false)'); g.advance(800); assert.equal(g.run('busy'), false);
});

test('returning to title clears callbacks and swim state but retains achievements', () => {
  const g = boot(); g.run("startGame('bd');ach.fish=1;runSwim({},()=>say(['Ikaw|Old scene']));setPaused(true);returnToTitle()");
  g.advance(4000); assert.equal(g.run('st'), 'menu'); assert.equal(g.run('adv'), null);
  assert.equal(g.run('swm'), false); assert.equal(g.run('tutCb'), null); assert.equal(g.run('pending.size'), 0);
  assert.equal(g.run('ach.fish'), 1); assert.equal(g.ids.get('g').children.some(el => el.inert), false);
  g.run("startGame('ig')"); g.advance(3000); assert.equal(g.ids.get('dn').textContent, 'Ikaw');
  assert.equal(g.run('fullT'), 'Ang lamig…');
});

test('keyboard allows native buttons and prevents game actions behind pause', () => {
  const g = boot(); g.run("startGame('ig')");
  assert.equal(g.key('Enter', g.ids.get('resume')), false);
  g.key('p'); assert.equal(g.run('paused'), true); assert.equal(g.ids.get('cv').inert, true);
  g.key('e'); assert.equal(g.run('adv'), null);
  g.key('Escape'); assert.equal(g.run('paused'), false); assert.equal(g.ids.get('cv').inert, false);
});

test('touch movement releases cleanly and stays disabled while paused', () => {
  const g=boot();g.run("startGame('bd');pending.clear();busy=false");
  const right=g.ids.get('br');
  right.events.pointerdown({pointerId:1,preventDefault(){}});g.advance(200);
  assert.ok(g.run('px')>70);
  right.events.pointercancel();const stopped=g.run('px');g.advance(200);assert.equal(g.run('px'),stopped);
  g.run('setPaused(true)');right.events.pointerdown({pointerId:2,preventDefault(){}});
  assert.equal(g.run('R'),0);g.advance(300);assert.equal(g.run('px'),stopped);
  g.run('setPaused(false)');g.advance(200);assert.equal(g.run('px'),stopped);
});

test('fisher and player stand on the deck; spear meets target beneath it', () => {
  const g = boot(); g.run("RT='bd';ins=false");
  assert.equal(g.run('footY(480,.05)'), g.run('PIER.y'));
  assert.equal(g.run('footY(550,.9)'), g.run('PIER.y'));
  assert.equal(g.run('spearPose(2.2).y'), 34); assert.equal(g.run('spearPose(2.2).x'), 30);
  assert.equal(g.run('spearPose(2.2).caught'), true); assert.equal(g.run('spearPose(0).caught'), false);
  g.run("RT='ig'"); assert.notEqual(g.run('footY(480,.05)'), g.run('PIER.y'));
});

test('all nine animated collectibles remain reachable after a viewport resize', () => {
  const g=boot();g.run("startGame('bd');pending.clear();runSwim({},()=>{busy=false});tutCb();innerWidth=2400;innerHeight=900;fit();px=W-20;innerWidth=390;innerHeight=844;fit()");
  assert.ok(g.run('px<=W-20'));
  assert.equal(g.run('swS.f.length'),9);assert.equal(g.run('new Set(swS.f.map(f=>f.t)).size'),6);
  g.run('for(const f of swS.f){const point=swPoint(f);px=point.x;pz=(point.y-30)/140;swC()}');
  assert.equal(g.run('swS.got'),9);assert.equal(g.run('swm'),false);
});

test('every exported Piskel layer has the expected sprite frame dimensions', () => {
  const g=boot();
  for(const [key,meta] of Object.entries(g.run('MARINE')))for(let i=0;i<meta.layers;i++){
    const png=fs.readFileSync(path.join(root,'assets','marine',`${key}-${i}.png`));
    assert.equal(png.readUInt32BE(16),meta.frames*32);assert.equal(png.readUInt32BE(20),32);
  }
  for(const [key,meta] of Object.entries(g.run('VILLAGE')))for(let i=0;i<meta.layers;i++){
    const png=fs.readFileSync(path.join(root,'assets','village',`${meta.file||key}-${i}.png`));
    assert.equal(png.readUInt32BE(16),meta.width);assert.equal(png.readUInt32BE(20),meta.height);
  }
});

test('supplied character layers render in order and match dialogue portraits', () => {
  const g=boot({recordDraws:true});
  assert.equal(g.run("villageSprite('fisherman',0,0,32,32)"),false,'unloaded artwork must use fallback');
  g.run('for(const sprite of Object.values(VILLAGE))for(const image of sprite.images){image.complete=true;image.naturalWidth=sprite.width}');
  for(const [name,key] of [['Lola','lola'],['Nakatatanda','elder'],['Mangingisda','fisherman']]){
    for(const route of ['ig','bd']){
      g.drawCalls.length=0;
      g.run(`RT='${route}';busy=true;ppl(100,170,ELD,1,0,.5,0,0,null,'${name}');portrait('${name}',0)`);
      const draws=g.drawCalls.filter(call=>call.method==='drawImage');
      const count=g.run(`VILLAGE.${key}.layers`);
      const filename=g.run(`VILLAGE.${key}.file||'${key}'`);
      assert.equal(draws.length,count*2);
      assert.equal(draws[0].args[0].src,`assets/village/${filename}-${count-1}.png`);
      assert.equal(draws[count].args[0].src,`assets/village/${filename}-${count-1}.png`);
      assert.deepEqual(draws[count].args.slice(1,5),[4,1,24,24]);
    }
  }
  g.drawCalls.length=0;g.run("tm=10;busy=false;px=50;cam=0;ppl(200,170,ELD,1,0,.5,0,0,null,'Nakatatanda')");
  assert.equal(g.drawCalls.find(call=>call.method==='drawImage').args[0].src,'assets/village/elder-1.png');
});

test('new house doorway can be entered and exited in both routes', () => {
  for(const route of ['ig','bd']){
    const g=boot();g.run(`startGame('${route}');pending.clear();step=2;home=false;busy=false;hud();px=HOUSE_DOOR_X;act()`);
    g.advance(route==='bd'?2400:900);assert.equal(g.run('home'),true,route+': '+g.run('JSON.stringify({px,ins,busy,climb})'));assert.equal(g.run('ins'),true);
    g.run('px=340;act()');g.advance(route==='bd'?2400:900);
    assert.equal(g.run('home'),false);assert.equal(g.run('ins'),false);assert.equal(g.run('px'),route==='bd'?140:188);
  }
});

test('detailed trees draw finite, stable pixels and skip offscreen work', () => {
  const g=boot({recordDraws:true});
  for(const kind of ['pine','palm']){
    g.drawCalls.length=0;g.run(`tm=1.5;drawTree(120,GY,'${kind}',403,(r,g,b)=>'rgb('+r+','+g+','+b+')')`);
    const first=JSON.stringify(g.drawCalls),pixels=g.drawCalls.filter(call=>call.method==='fillRect');
    assert.ok(pixels.length>100,'branches, leaflets and bark should have detail');
    assert.ok(pixels.every(call=>call.args.every(Number.isFinite)));
    g.drawCalls.length=0;g.run(`drawTree(120,GY,'${kind}',403,(r,g,b)=>'rgb('+r+','+g+','+b+')')`);
    assert.equal(JSON.stringify(g.drawCalls),first,'tree shape must not randomize every frame');
    g.drawCalls.length=0;g.run(`drawTree(-100,GY,'${kind}',403,()=> '#123')`);assert.equal(g.drawCalls.length,0);
  }
});

for (const route of ['ig', 'bd']) test(`${route}: entire route completes with the new timers and fishing activity`, () => {
  const g = boot(); g.run(`startGame('${route}')`); g.advance(2800);
  let guard = 0;
  while (g.run('st') === 'play' && guard++ < 500) {
    if (g.run('adv')) { g.run('act();act()'); continue; }
    if(g.run('houseEntryPending&&!busy')){g.run('px=HOUSE_LADDER.x;act()');g.advance(2400);continue;}
    if (g.run('tutCb')) g.run('act()');
    if (g.run('swm')) { g.run('for(const f of swS.f){if(f.g)continue;const p=swPoint(f);px=p.x;pz=(p.y-30)/140;swC()}'); continue; }
    if (g.ids.get('mg').classList.contains('on')) {
      const buttons = g.ids.get('mg').querySelectorAll('button');
      if (g.run('!!S[step].g.ch')) buttons[2].onclick();
      else for (const text of g.run('Array.from(S[step].g.s)')) { const b = buttons.find(b => b.textContent === text); if (!b.disabled) b.onclick(); }
      g.advance(800); continue;
    }
    if (g.run('busy')) { g.advance(1200); continue; }
    g.run('{const target=S[step].o.find(o=>!done[step+o.n]);px=target.x;talk(target)}');
  }
  assert.ok(guard < 500, 'route should not get stuck'); assert.equal(g.run('st'), 'end');
  assert.equal(g.run(route === 'ig' ? 'ach.learn' : 'ach.sealearn'), 1);
  g.ids.get('end').querySelector('button').onclick();g.advance(200);
  assert.equal(g.run('st'),'menu');assert.equal(g.run('pending.size'),0);
});

test('Badjao ladder supports manual keyboard and touch climbing, reversal and pause',()=>{
  const g=boot();g.run("startGame('bd');pending.clear();step=2;home=false;busy=false;hud();px=HOUSE_LADDER.x");
  g.key('w');g.advance(500);assert.ok(g.run('climb.progress')>0);assert.equal(g.run('ins'),false);
  g.run('keys={}');const progress=g.run('climb.progress');g.advance(500);assert.equal(g.run('climb.progress'),progress);
  g.run('setPaused(true)');g.advance(500);assert.equal(g.run('climb.progress'),progress);g.run('setPaused(false)');
  g.ids.get('bdn').events.pointerdown({pointerId:1,preventDefault(){}});g.advance(800);
  assert.equal(g.run('climb'),null);assert.equal(g.run('busy'),false);
  g.ids.get('bu').events.pointerdown({pointerId:2,preventDefault(){}});g.advance(2400);
  assert.equal(g.run('ins'),true);assert.equal(g.run('climb'),null);
});

test('Badjao story exits by ladder, and bedtime requires climbing back inside',()=>{
  const g=boot();g.run("startGame('bd');pending.clear();step=1;hud();nx()");g.advance(650);
  assert.ok(g.run('climb.progress')<1);assert.equal(g.run('climb.lastDir'),-1);g.advance(1800);
  assert.equal(g.run('busy'),false);g.run('step=11;home=false;hud();nx()');
  assert.equal(g.run('houseEntryPending'),true);assert.equal(g.run('ins'),false);
  g.run('px=70');assert.equal(g.run('near()'),null,'cannot use the sleeping mat from outdoors');
  g.run('px=HOUSE_LADDER.x;act()');g.advance(2400);
  assert.equal(g.run('houseEntryPending'),false);assert.equal(g.run('ins'),true);
  g.run('returnToTitle()');assert.equal(g.run('climb'),null);
});

test('boat artwork renders in the coast, window and Lepa object without invalid coordinates',()=>{
  const g=boot({recordDraws:true});g.drawCalls.length=0;
  g.run("drawBoat(200,140,.62,1);drawBoat(110,100,.46,2);prop('Lepa',200,180,.5)");
  assert.ok(g.drawCalls.filter(x=>x.method==='fillRect').length>100);
  assert.ok(g.drawCalls.filter(x=>['fillRect','translate','scale','moveTo','lineTo'].includes(x.method)).every(x=>x.args.every(Number.isFinite)));
});
