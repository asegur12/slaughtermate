// Tests for Slaughtermate. Every test name starts with the requirement it
// checks (R1 = R1 in problem.md). Each test loads a fresh copy of the game
// from index.html (see load-game.js) and calls the game's real functions.
//
// Run from the repository folder:   node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, HTML } = require('./load-game.js');

/** A fresh game, already playing with the given weapon, with no enemies yet. */
function fresh(weapon = 'sword') {
  const g = loadGame();
  g.run(`newRun('${weapon}'); G.enemies = []; P.hp = P.maxHp = 1e9;`);
  return g;
}

/** Spawn an enemy that can't die, so we can see whether it was hit. */
function dummy(g, x, y, type = 'rook') {
  return g.run(`(() => { const e = spawnEnemy('${type}', ${x}, ${y}); e.hp = e.maxHp = 1e6; return e; })()`);
}
const wasHit = (e) => e.hp < e.maxHp;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const tierOf = (g, t) => g.data(`SPELLS.filter(s => s.tier === ${t})`);

// Record which piece is drawn, and how, instead of drawing it.
function spyOnPieces(g) {
  g.run('var drawn = []; drawPiece = (type, x, y, s, o) => drawn.push({ type, s, fill: o.fill });');
  return () => g.run('drawn');
}

// ---------------------------------------------------------------- R1 --

test('R1: the player is drawn as a white pawn', () => {
  const g = fresh();
  const drawn = spyOnPieces(g);
  g.run('drawPlayer()');
  const [player] = drawn();
  assert.equal(player.type, 'pawn');
  assert.ok(rgb(player.fill).every((c) => c > 200), `${player.fill} should be white`);
});

test('R1: enemies are drawn as black pieces', () => {
  const g = fresh();
  const drawn = spyOnPieces(g);
  for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
    g.run(`drawEnemy(spawnEnemy('${type}', P.x + 300, P.y))`);
  }
  for (const piece of drawn()) {
    assert.ok(rgb(piece.fill).every((c) => c < 60), `${piece.type} ${piece.fill} should be black`);
  }
});

test('R1: bosses are giant checkered pieces', () => {
  const g = fresh();
  const drawn = spyOnPieces(g);
  g.run('spawnBoss(); drawEnemy(G.boss)');
  const [boss] = drawn();
  assert.equal(boss.fill, g.run('CHECK'), 'boss should be filled with the checker pattern');
  assert.match(HTML, /fillStyle='#151515'.*fillStyle='#ece6d6'/s, 'checker uses black and white squares');
  assert.ok(boss.s >= 3 * g.run('ETYPES.pawn.s'), 'boss should be at least 3x a normal pawn');
});

// ---------------------------------------------------------------- R2 --

test('R2: the map is much larger than the screen', () => {
  const g = fresh();
  assert.ok(g.run('WORLD') >= 2 * g.run('innerWidth'));
});

test('R2: every map has castles and cities', () => {
  const g = fresh();
  for (let i = 0; i < 5; i++) {
    const kinds = new Set(g.run('genMap().map(s => s.k)'));
    for (const kind of ['wall', 'tower', 'keep', 'house']) {
      assert.ok(kinds.has(kind), `map ${i} should contain a ${kind}`);
    }
  }
});

// ---------------------------------------------------------------- R3 --

test('R3: enemies spawn away from the player, never on top of them', () => {
  const g = fresh();
  for (let i = 0; i < 200; i++) {
    const p = g.run('spawnPos()');
    if (!p) continue;
    assert.ok(Math.hypot(p.x - g.run('P.x'), p.y - g.run('P.y')) >= 450);
    assert.ok(p.x > 0 && p.y > 0 && p.x < g.run('WORLD') && p.y < g.run('WORLD'));
  }
});

test('R3: a swarm surrounds the player from all sides, just off screen', () => {
  const g = fresh();
  g.run("G.phase = 'wave'; G.packT = 0; spawnTick(0)");
  const enemies = g.run('G.enemies.map(e => ({ dx: e.x - P.x, dy: e.y - P.y }))');
  assert.ok(enemies.length >= 8, `swarm had ${enemies.length} enemies`);
  const sides = new Set(enemies.map((e) => `${e.dx > 0 ? 'E' : 'W'}${e.dy > 0 ? 'S' : 'N'}`));
  assert.deepEqual([...sides].sort(), ['EN', 'ES', 'WN', 'WS']);
  for (const e of enemies) assert.ok(Math.hypot(e.dx, e.dy) > Math.hypot(1280, 720) / 2);
});

test('R3: enemies move toward the player', () => {
  const g = fresh();
  const e = g.run("spawnEnemy('pawn', P.x + 300, P.y + 100)");
  const before = g.run(`Math.hypot(P.x - ${e.x}, P.y - ${e.y})`);
  g.run('updateEnemy(G.enemies[0], 0.1)');
  assert.ok(g.run('Math.hypot(P.x - G.enemies[0].x, P.y - G.enemies[0].y)') < before);
});

// ---------------------------------------------------------------- R4 --

test('R4: every enemy piece type has its own behavior', () => {
  const g = fresh();
  assert.deepEqual(g.data('Object.keys(AI)'), g.data('FORMS'));
  assert.equal(new Set(g.run('Object.values(AI)')).size, 6);
});

test('R4: knights hop in L-shapes (2 squares one way, 1 the other)', () => {
  const g = fresh();
  g.run("var e = spawnEnemy('knight', P.x + 300, P.y + 100); e.t = 0.001; updateEnemy(e, 0.016)");
  assert.equal(g.run('e.st'), 'hop');
  const [ax, ay] = g.run('[Math.abs(e.tx - e.fx), Math.abs(e.ty - e.fy)]');
  assert.ok(Math.abs(ax - 2 * ay) < 1e-9, `hop was ${ax} x ${ay}`);
});

test('R4: bishops move only diagonally and shoot from range', () => {
  const g = fresh();
  g.run("var e = spawnEnemy('bishop', P.x + 400, P.y + 300); e.cd = 99; var x0 = e.x, y0 = e.y; updateEnemy(e, 0.1)");
  const [mx, my] = g.run('[e.x - x0, e.y - y0]');
  assert.ok(Math.abs(Math.abs(mx) - Math.abs(my)) < 1e-9 && mx !== 0, `moved ${mx}, ${my}`);
  g.run('e.cd = 0; updateEnemy(e, 0.016)');
  assert.equal(g.run('G.eproj.length'), 1);
});

test('R4: rooks move in straight lines and charge when lined up', () => {
  const g = fresh();
  g.run("var e = spawnEnemy('rook', P.x + 400, P.y + 150); e.cd = 99; var y0 = e.y; updateEnemy(e, 0.1)");
  assert.equal(g.run('e.y - y0'), 0, 'rook should move along one line only');
  g.run("var r = spawnEnemy('rook', P.x + 400, P.y + 10); r.cd = 0; updateEnemy(r, 0.016)");
  assert.equal(g.run('r.st'), 'wind', 'lined-up rook should wind up a charge');
});

test('R4: queens fire a fan of 7 bolts', () => {
  const g = fresh();
  g.run("var e = spawnEnemy('queen', P.x + 400, P.y); e.cd = 0; e.cd2 = 99; updateEnemy(e, 0.016)");
  assert.equal(g.run('G.eproj.length'), 7);
});

test('R4: kings summon pawns', () => {
  const g = fresh();
  g.run("var e = spawnEnemy('king', P.x + 400, P.y); e.cd = 0; updateEnemy(e, 0.016)");
  assert.deepEqual(g.data("G.enemies.filter(x => x !== e).map(x => x.type)"), ['pawn', 'pawn', 'pawn']);
});

// ---------------------------------------------------------------- R5 --

test('R5: 6 bosses, one giant piece of each kind, one per floor', () => {
  const g = fresh();
  assert.deepEqual(g.data('BOSSES.map(b => b.type)'), g.data('FORMS'));
  const names = [];
  for (let floor = 1; floor <= 6; floor++) {
    g.run(`G.floor = ${floor}; G.enemies = []; spawnBoss()`);
    assert.equal(g.run('G.boss.type'), g.run(`FORMS[${floor - 1}]`));
    assert.ok(g.run('G.boss.s') > 2.5 * g.run('ETYPES[G.boss.type].s'), 'boss should be giant');
    names.push(g.run('G.boss.name'));
  }
  assert.equal(new Set(names).size, 6);
});

test('R5: the boss arrives when the wave ends', () => {
  const g = fresh();
  g.run('G.floorTime = G.dur; update(0.01)');
  assert.equal(g.run('G.phase'), 'boss');
  assert.equal(g.run('G.boss.name'), 'Iron Pawn');
});

test('R5: the next floor only starts after the boss is killed', () => {
  const g = fresh();
  g.run('spawnBoss(); for (let i = 0; i < 20; i++) update(0.05)');
  assert.equal(g.run('G.phase'), 'boss', 'still the boss fight while it lives');
  assert.equal(g.run('G.floor'), 1);
  g.run('killEnemy(G.boss)');
  assert.equal(g.run('G.phase'), 'cleared');
  g.run('G.clearT = 0; update(0.05)');
  assert.equal(g.run('G.state'), 'shop');
  g.el('shGo').onclick();
  assert.equal(g.run('G.floor'), 2);
  assert.equal(g.run('G.phase'), 'wave');
});

// ---------------------------------------------------------------- R6 --

test('R6: each boss kill promotes the pawn: knight, bishop, rook, queen, king', () => {
  const g = fresh();
  assert.equal(g.run('FORMS[P.form]'), 'pawn');
  const forms = [];
  for (let floor = 1; floor <= 5; floor++) {
    g.run(`G.floor = ${floor}; G.enemies = []; spawnBoss(); killEnemy(G.boss)`);
    forms.push(g.run('FORMS[P.form]'));
  }
  assert.deepEqual(forms, ['knight', 'bishop', 'rook', 'queen', 'king']);
  const drawn = spyOnPieces(g);
  g.run('drawPlayer()');
  assert.equal(drawn()[0].type, 'king');
});

// ---------------------------------------------------------------- R7 --

test('R7: there are 4 weapons and the chosen one is used for the run', () => {
  const g = loadGame();
  assert.deepEqual(g.data('Object.keys(WEAPONS)'), ['sword', 'bow', 'staff', 'hammer']);
  assert.equal(g.el('weapons').children.length, 4, 'menu shows 4 weapon cards');
  g.run("newRun('hammer')");
  assert.equal(g.run('G.weapon'), 'hammer');
});

test('R7: Sword slashes in front, and its charged spin slash hits all around', () => {
  const g = fresh('sword');
  g.run('P.aim = 0');                              // facing right
  const front = dummy(g, 'P.x + 60', 'P.y');
  const behind = dummy(g, 'P.x - 150', 'P.y');
  g.run('basicAttack()');
  assert.ok(wasHit(front) && !wasHit(behind), 'slash hits in front only');
  g.run('chargedAttack()');
  assert.ok(wasHit(behind), 'spin slash hits behind too');
});

test('R7: Bow shoots arrows, and its charged big arrow pierces everything', () => {
  const g = fresh('bow');
  g.run('P.aim = 0; basicAttack()');
  assert.deepEqual(g.data('[G.pproj[0].kind, G.pproj[0].pierce, G.pproj[0].vx > 0]'), ['arrow', 1, true]);
  g.run('chargedAttack()');
  const big = g.run('G.pproj[1]');
  assert.equal(big.kind, 'bigarrow');
  assert.ok(big.pierce >= 999 && big.dmg > 4 * g.run('G.pproj[0].dmg'));
});

test('R7: Staff fires exploding orbs, and its charged blast hits an area at the cursor', () => {
  const g = fresh('staff');
  g.run('P.aim = 0; cam.x = 0; cam.y = 0; mouse.x = P.x + 300; mouse.y = P.y; basicAttack()');
  assert.ok(g.run('G.pproj[0].explode') > 0, 'orb explodes (area damage)');
  const a = dummy(g, 'P.x + 300', 'P.y - 100');
  const b = dummy(g, 'P.x + 300', 'P.y + 100');
  const far = dummy(g, 'P.x - 300', 'P.y');
  g.run('chargedAttack()');
  assert.ok(wasHit(a) && wasHit(b) && !wasHit(far));
});

test('R7: Hammer hits an area in front, and its charged slam hits and stuns all around', () => {
  const g = fresh('hammer');
  g.run('P.aim = 0');
  const left = dummy(g, 'P.x + 55', 'P.y - 45');
  const right = dummy(g, 'P.x + 55', 'P.y + 45');
  g.run('basicAttack()');
  assert.ok(wasHit(left) && wasHit(right), 'one blow hits both enemies');
  const ring = [[200, 0], [-200, 0], [0, 200], [0, -200]].map(([dx, dy]) => dummy(g, `P.x + ${dx}`, `P.y + ${dy}`, 'pawn'));
  g.run('chargedAttack()');
  for (const e of ring) assert.ok(wasHit(e) && e.stunT > 0, 'slam hits and stuns');
});

// ---------------------------------------------------------------- R8 --

test('R8: higher tiers deal more damage over larger areas', () => {
  const g = fresh();
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const dmg = [], reach = [];
  for (let t = 1; t <= 5; t++) {
    const spells = tierOf(g, t);
    dmg.push(mean(spells.filter((s) => s.dmg).map((s) => s.dmg)));
    reach.push(mean(spells.map((s) => Math.max(s.r || 0, s.spread || 0, s.len || 0)).filter((r) => r > 0)));
  }
  for (let t = 1; t < 5; t++) {
    assert.ok(dmg[t] > dmg[t - 1], `tier ${t + 1} damage ${dmg[t]} <= tier ${t} ${dmg[t - 1]}`);
    assert.ok(reach[t] > reach[t - 1], `tier ${t + 1} area ${reach[t]} <= tier ${t} ${reach[t - 1]}`);
  }
});

test('R8: tier 5 is massive compared with tiers 1-2', () => {
  const g = fresh();
  const small = [...tierOf(g, 1), ...tierOf(g, 2)].filter((s) => s.dmg);
  const massive = tierOf(g, 5);
  const area = (s) => Math.max(s.r || 0, s.spread || 0, s.len || 0);
  assert.ok(Math.min(...massive.map((s) => s.dmg)) > 4 * Math.max(...small.map((s) => s.dmg)));
  assert.ok(Math.min(...massive.map(area)) > 2 * Math.max(...small.map(area)));
});

// ---------------------------------------------------------------- R9 --

test('R9: every tier has 5 to 8 spells', () => {
  const g = fresh();
  for (let t = 1; t <= 5; t++) {
    const n = tierOf(g, t).length;
    assert.ok(n >= 5 && n <= 8, `tier ${t} has ${n} spells`);
  }
});

test('R9: the player can equip 3 spells, and no more', () => {
  const g = fresh();
  const ids = tierOf(g, 2).map((s) => s.id);
  g.run(`equipSpell('${ids[0]}', () => {}); equipSpell('${ids[1]}', () => {})`);
  assert.equal(g.run('P.spells.filter(Boolean).length'), 3);
  g.run(`equipSpell('${ids[2]}', () => {})`);
  assert.equal(g.run('P.spells.length'), 3);
  assert.ok(!g.run(`P.spells.some(s => s.id === '${ids[2]}')`), 'a 4th spell is not added');
  assert.match(g.el('replace').innerHTML, /Your spell slots are full/);
  g.run(`equipSpell('${ids[0]}', () => {})`);
  assert.equal(g.run(`P.spells.find(s => s.id === '${ids[0]}').lvl`), 2, 'picking it again levels it up');
});

// --------------------------------------------------------------- R10 --

test('R10: the top tiers include sun, moon, darkness, light, tech and hyper spells', () => {
  const g = fresh();
  const six = ['sun', 'moon', 'darkness', 'light', 'tech', 'hyper'];
  const tier5 = tierOf(g, 5).map((s) => s.el).sort();
  assert.deepEqual(tier5, [...six].sort(), 'tier 5 has exactly one of each');
  const tier4 = new Set(tierOf(g, 4).map((s) => s.el));
  for (const el of six) assert.ok(tier4.has(el), `tier 4 should include ${el}`);
});

// --------------------------------------------------------------- R11 --

test('R11: enemy HP and damage rise with floor, level and time', () => {
  const g = fresh();
  const stats = (setup) => g.run(`(() => { ${setup}; const e = spawnEnemy('pawn', 0, 0); return [e.hp, e.dmg]; })()`);
  const [hp1, dmg1] = stats('G.floor = 1; P.level = 1; G.floorTime = 0');
  const [hp6, dmg6] = stats('G.floor = 6; P.level = 1; G.floorTime = 0');
  const [hpLv] = stats('G.floor = 1; P.level = 20; G.floorTime = 0');
  const [hpLate] = stats('G.floor = 1; P.level = 1; G.floorTime = 60');
  assert.ok(hp6 > 3 * hp1 && dmg6 > 2 * dmg1, 'floor 6 enemies are much stronger');
  assert.ok(hpLv > hp1, 'enemies get tougher as the player levels up');
  assert.ok(hpLate > hp1, 'enemies get tougher the longer a floor lasts');
});

test('R11: late-game enemies can kill a strong player quickly', () => {
  function hitsToKill(floor, floorTime) {
    const g = fresh();
    return g.run(`(() => {
      P.maxHp = P.hp = 300; G.floor = ${floor}; G.floorTime = ${floorTime};
      const e = spawnEnemy('rook', 0, 0); let n = 0;
      while (P.hp > 0 && n < 100) { P.iframes = 0; damagePlayer(e.dmg); n++; }
      return [n, G.state];
    })()`);
  }
  const [early] = hitsToKill(1, 0);
  const [late, state] = hitsToKill(6, 60);
  assert.equal(state, 'over', 'the run ends when the player dies');
  assert.ok(late <= 6 && late < early / 2, `late game took ${late} hits, early ${early}`);
});

test('R11: late-game enemies survive even the strongest spell hit', () => {
  const g = fresh();
  const strongest = Math.max(...g.run('SPELLS.map(s => s.dmg || 0)'));
  const kingHp = g.run("G.floor = 6; P.level = 1; G.floorTime = 0; spawnEnemy('king', 0, 0).hp");
  assert.ok(kingHp > strongest, `floor 6 king has ${kingHp} HP vs ${strongest} damage`);
});

// --------------------------------------------------------------- R12 --

test('R12: shuffle bag: every spell in a tier is offered before any repeats', () => {
  const g = fresh();
  const tier1 = tierOf(g, 1).map((s) => s.id).sort();
  g.run('G.bags[1] = []');
  const first = g.data('Array.from({ length: 6 }, () => drawSpell(1, new Set()))');
  assert.deepEqual([...first].sort(), tier1);
  const many = g.data('Array.from({ length: 600 }, () => drawSpell(1, new Set()))');
  for (const id of tier1) assert.equal(many.filter((x) => x === id).length, 100, id);
});

test('R12: pity makes a tier 4-5 spell more likely the longer you go without one', () => {
  const g = fresh();
  g.run('var realRandom = Math.random; Math.random = () => 0.5; G.floor = 1');
  assert.equal(g.run('G.pity = 0; rollTier(0)'), 1);
  assert.equal(g.run('G.pity'), 1, 'pity grows after a low tier');
  assert.equal(g.run('G.pity = 60; rollTier(0)'), 4, 'the same roll gives tier 4 with high pity');
  assert.equal(g.run('G.pity'), 0, 'pity resets after a high tier');
  g.run('Math.random = realRandom');
});

test('R12: level-up offers 3 different cards, and every spell gets offered', () => {
  const g = fresh();
  const offered = new Set();
  for (let i = 0; i < 200; i++) {
    const cards = g.run('makeCards()');
    assert.equal(cards.length, 3);
    const ids = cards.map((c) => c.id || c.up.id);
    assert.equal(new Set(ids).size, 3, 'no duplicate cards');
    for (const c of cards) if (c.type === 'spell') offered.add(c.id);
  }
  for (const s of tierOf(g, 1)) assert.ok(offered.has(s.id), `${s.id} was never offered`);
});

// --------------------------------------------------------------- R13 --

test('R13: the shop sells spells, relics and a potion for gold', () => {
  const g = fresh();
  g.run('P.gold = 1000; P.hp = P.maxHp = 100; P.hp = 50; openShop()');
  assert.equal(g.run('G.state'), 'shop');
  assert.equal(g.run('G.shop.spells.length'), 4);
  assert.equal(g.run('G.shop.stats.length'), 3);

  const spell = g.run('G.shop.spells[0]');
  const price = g.run(`SPELL_PRICE[SPELL_BY_ID['${spell}'].tier]`);
  g.el('shSpells').children[0].onclick();
  assert.equal(g.run('P.gold'), 1000 - price);
  assert.ok(g.run(`P.spells.some(s => s && s.id === '${spell}')`), 'bought spell is equipped');

  let gold = g.run('P.gold');
  g.el('shItems').children[0].onclick();                       // Royal Elixir
  assert.equal(g.run('P.hp'), g.run('P.maxHp'));
  assert.equal(g.run('P.gold'), gold - (25 + 10 * g.run('G.floor')));

  gold = g.run('P.gold');
  g.el('shItems').children[1].onclick();                       // a relic
  assert.equal(g.run('P.gold'), gold - (70 + 25 * g.run('G.floor')));
});

// --------------------------------------------------------------- R14 --

test('R14: W A S D move up, left, down and right', () => {
  const g = fresh();
  const expected = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
  for (const [key, [sx, sy]] of Object.entries(expected)) {
    const [x0, y0] = g.run('[P.x, P.y]');
    g.fire('keydown', { key: key.toUpperCase() });
    g.run('updatePlayer(0.1)');
    g.fire('keyup', { key });
    const [x1, y1] = g.run('[P.x, P.y]');
    assert.equal(Math.sign(Math.round(x1 - x0)), sx, `${key} x`);
    assert.equal(Math.sign(Math.round(y1 - y0)), sy, `${key} y`);
  }
});

test('R14: attacks aim at the mouse', () => {
  const g = fresh();
  g.run('cam.x = 0; cam.y = 0; mouse.x = P.x; mouse.y = P.y + 100; updatePlayer(0.016)');
  assert.ok(Math.abs(g.run('P.aim') - Math.PI / 2) < 1e-9);
});

test('R14: a left click is a basic attack; holding and releasing is a charged attack', () => {
  const g = fresh();
  g.fire('mousedown', { button: 0 });
  g.fire('mouseup', { button: 0 });
  assert.equal(g.run('P.swingT'), 0.15, 'quick click = basic attack');
  g.run('P.atkCd = 0');
  g.fire('mousedown', { button: 0 });
  g.run('for (let i = 0; i < 30; i++) updatePlayer(0.05)');   // hold for 1.5 seconds
  assert.equal(g.run('P.charge'), 1, 'fully charged');
  g.fire('mouseup', { button: 0 });
  assert.equal(g.run('P.swingT'), 0.3, 'release = charged attack');
});

test('R14: keys 1, 2 and 3 cast the equipped spells', () => {
  const g = fresh();
  const ids = tierOf(g, 2).map((s) => s.id);
  g.run(`equipSpell('${ids[0]}', () => {}); equipSpell('${ids[1]}', () => {})`);
  for (const key of ['1', '2', '3']) {
    assert.equal(g.run(`P.spells[${key} - 1].cd`), 0);
    g.fire('keydown', { key });
    assert.ok(g.run(`P.spells[${key} - 1].cd`) > 0, `key ${key} should cast slot ${key}`);
  }
});

// --------------------------------------------------------------- R15 --

test('R15: the menu scoreboard shows each run\'s highest floor and score', () => {
  const scores = [
    { name: 'Ben', floor: 6, score: 91000, weapon: 'Sword', won: true },
    { name: 'Ana', floor: 4, score: 52000, weapon: 'Bow', won: false },
  ];
  const g = loadGame({ scores });
  assert.equal(g.run('G.state'), 'menu', 'the game opens on the menu');
  assert.match(g.el('bestFloor').textContent, /^6/);
  assert.match(g.el('bestScore').textContent, /91/);
  const rows = g.el('scores').innerHTML;
  for (const s of scores) {
    assert.ok(rows.includes(`<td>${s.floor}</td>`), `floor ${s.floor} listed`);
    assert.ok(rows.includes(s.name));
  }
});

test('R15: an empty scoreboard says no games have been played', () => {
  const g = loadGame();
  assert.equal(g.el('bestFloor').textContent, '–');
  assert.match(g.el('scores').innerHTML, /No games played yet/);
});

test('R15: a finished run is saved to the scoreboard with its floor and score', () => {
  const g = fresh();
  g.run('G.floor = 3; G.score = 1000; endRun(false)');
  g.el('nameIn').value = 'Aidan';
  g.el('saveBtn').onclick();
  const [saved] = JSON.parse(g.storage.slaughtermate_scores);
  assert.equal(saved.name, 'Aidan');
  assert.equal(saved.floor, 3);
  assert.equal(saved.score, 1000 + 2 * 1000 + 50);   // score + 1000 per floor reached + 50 x level
  assert.ok(g.el('scores').innerHTML.includes('Aidan'), 'menu shows the new score');
});

// --------------------------------------------------------------- R16 --

test('R16: the game loads nothing from the internet', () => {
  assert.doesNotMatch(HTML, /https?:\/\//, 'no web addresses');
  assert.doesNotMatch(HTML, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(HTML, /<link[^>]+href=/, 'no external stylesheets or fonts');
  assert.doesNotMatch(HTML, /\bfetch\(|XMLHttpRequest|WebSocket|import\(/, 'no network calls');
});

test('R16: the whole game runs with no network available', () => {
  // loadGame gives the game no fetch, no network and no files: if it needed
  // any, loading or playing would throw.
  const g = fresh();
  assert.doesNotThrow(() => g.run('for (let i = 0; i < 100; i++) update(0.05)'));
});
