// Loads the game's <script> from index.html into Node, with stand-ins for the
// browser (page elements, canvas, keyboard/mouse events, localStorage), so the
// tests can call the game's real functions. The game itself is not changed.
//
// Usage:  const game = loadGame();  game.run('G.floor')  ->  1

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + '<script>'.length, HTML.lastIndexOf('</script>'));

// A "do-anything" object: any property can be read, set or called. Values that
// are set are remembered, children added with appendChild are kept in
// .children, and addEventListener handlers are kept in .listeners.
function makeStub() {
  const store = { children: [], listeners: {} };
  const handler = {
    get(_t, key) {
      if (key in store) return store[key];
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then') return undefined;
      if (key === 'appendChild') return (child) => { store.children.push(child); return child; };
      if (key === 'addEventListener') {
        return (type, fn) => { (store.listeners[type] ||= []).push(fn); };
      }
      return (store[key] = makeStub());
    },
    set(_t, key, value) {
      store[key] = value;
      if (key === 'innerHTML') store.children = [];
      return true;
    },
    apply() { return makeStub(); },
    construct() { return makeStub(); },
  };
  return new Proxy(function () {}, handler);
}

function loadGame({ scores } = {}) {
  const elements = {};
  const windowListeners = {};
  const storage = {};
  if (scores) storage.slaughtermate_scores = JSON.stringify(scores);

  const context = {
    console,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    document: {
      getElementById: (id) => (elements[id] ||= makeStub()),
      createElement: () => makeStub(),
    },
    addEventListener: (type, fn) => { (windowListeners[type] ||= []).push(fn); },
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
    },
    Path2D: class { moveTo() {} lineTo() {} closePath() {} ellipse() {} },
    DOMMatrix: class {},
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,   // the game loop never runs on its own
    setTimeout: () => 0,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: 'index.html' });

  return {
    /** Run JavaScript inside the game and return the result (a live object). */
    run: (code) => vm.runInContext(code, context),
    /** Like run, but returns a plain copy. The game runs in its own JavaScript
        "world", and its arrays never count as strictly equal to the tests'
        arrays, so copy results before comparing them with deepEqual. */
    data: (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context))),
    /** A page element by id, e.g. el('scores').innerHTML. */
    el: (id) => context.document.getElementById(id),
    /** Pretend the user pressed or released a key / mouse button. */
    fire: (type, event) => {
      for (const fn of windowListeners[type] || []) fn(event);
      for (const fn of context.document.getElementById('c').listeners[type] || []) fn(event);
    },
    storage,
  };
}

module.exports = { loadGame, HTML };
