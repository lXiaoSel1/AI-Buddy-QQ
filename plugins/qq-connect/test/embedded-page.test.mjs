import test from 'node:test';
import assert from 'node:assert/strict';

// The actual client entry with light fakes for the page globals, DSH's ModuleLoader, slots, layout and React hooks.
// It checks the host contract for showing this page inside AI Buddy's window; it is not a visual acceptance.
const PLUGIN = '@ai-buddy/qq-connect', KEY = 'qq-connect', EVENT = 'ai-buddy:open-plugin-page';
const ORIGINAL = {window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch};
const restore = () => {for (const [key, value] of Object.entries(ORIGINAL)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;};
let loads = 0;

function fakeReact() {
  let frame = null;
  const React = {Fragment: 'fragment', createElement: (type, props, ...children) => ({type, props: props ?? {}, children}), useRef: current => ({current}),
    useState(init) {const f = frame, value = typeof init === 'function' ? init() : init;f.states.push(value);return [value, next => f.sets.push(typeof next === 'function' ? next(value) : next)];},
    useEffect(effect) {frame.effects.push(effect);}};
  const mount = Component => {const f = frame = {states: [], sets: [], effects: []};const tree = Component({});const cleanups = f.effects.map(effect => effect()).filter(value => typeof value === 'function');return {...f, tree, unmount: () => cleanups.forEach(cleanup => cleanup())};};
  return {React, mount};
}

async function load(t, {openPlugin, selectFails = false} = {}) {
  const events = new EventTarget(), hooked = new Set(), styles = [], dataset = {};
  if (openPlugin) dataset.buddyOpenPlugin = openPlugin;
  let entry;
  const window = {location: {href: 'https://local.invalid/qq'}, __ModuleLoader__: {load(value) {entry = value;}}, dispatchEvent: event => events.dispatchEvent(event),
    addEventListener(type, listener) {if (type === EVENT) hooked.add(listener);events.addEventListener(type, listener);},
    removeEventListener(type, listener) {if (type === EVENT) hooked.delete(listener);events.removeEventListener(type, listener);}};
  const document = {documentElement: {dataset}, getElementById: () => null, createElement: tag => ({tag}), head: {append: element => styles.push(element)}, addEventListener() {}, removeEventListener() {}};
  globalThis.window = window;globalThis.document = document;globalThis.fetch = () => new Promise(() => {});
  t.after(restore);
  await import('../src/client/index.mjs?embedded-' + (++loads));
  assert.equal(entry.id, PLUGIN);
  const {React, mount} = fakeReact(), plugin = entry.factory(id => {assert.equal(id, 'react');return React;});
  assert.ok(plugin.inject.includes('layout'));
  const callbacks = new Map(), registered = new Map(), calls = [];
  plugin.apply({
    slots: {inject(name, callback) {callbacks.set(name, callback);}, register(spec, component) {const id = spec.key ?? spec.id;registered.set(id, component);calls.push(['register', spec.name, id]);return () => {registered.delete(id);calls.push(['unregister', id]);};}},
    layout: {selectPanel(id) {if (selectFails || !registered.has(id)) throw Object.assign(Error('Unknown panel ' + id), {code: 'LAYOUT_PANEL_UNKNOWN'});calls.push(['select', id]);}},
  });
  const open = detail => window.dispatchEvent(new CustomEvent(EVENT, {detail}));
  return {callbacks, registered, calls, dataset, hooked, styles, open, mount, selects: () => calls.filter(call => call[0] === 'select').length};
}

test('the page answers only its own open request: selects its panel, then sets data-buddy-panel', async t => {
  const page = await load(t);
  assert.equal(page.calls.length, 0, 'nothing happens before the main slot exists');
  page.callbacks.get('main')();
  assert.deepEqual(page.calls, [['register', 'main', KEY]], 'no request was named, so DSH stays on its own panel');
  assert.equal(page.hooked.size, 1);
  page.open({pluginId: '@ai-buddy/bilibili-companion'});page.open(undefined);page.open({});
  assert.equal(page.selects(), 0);assert.equal(page.dataset.buddyPanel, undefined);
  page.open({pluginId: PLUGIN});
  assert.deepEqual(page.calls.at(-1), ['select', KEY]);assert.equal(page.dataset.buddyPanel, PLUGIN);
  page.dataset.buddyPanel = '@ai-buddy/bilibili-companion';page.open({pluginId: PLUGIN});
  assert.equal(page.dataset.buddyPanel, PLUGIN, 'switching back from Bilibili answers again');
});

test('a request named on <html> before registration is answered as soon as the main panel exists', async t => {
  const page = await load(t, {openPlugin: PLUGIN});
  page.callbacks.get('main')();
  assert.deepEqual(page.calls, [['register', 'main', KEY], ['select', KEY]]);assert.equal(page.dataset.buddyPanel, PLUGIN);
  const other = await load(t, {openPlugin: '@ai-buddy/bilibili-companion'});
  other.callbacks.get('main')();
  assert.equal(other.selects(), 0);assert.equal(other.dataset.buddyPanel, undefined);
});

test('disposing the main slot removes the open listener with the panel', async t => {
  const page = await load(t), dispose = page.callbacks.get('main')();
  assert.equal(typeof dispose, 'function');assert.equal(page.hooked.size, 1);
  dispose();
  assert.equal(page.hooked.size, 0);assert.equal(page.registered.has(KEY), false);
  page.open({pluginId: PLUGIN});
  assert.equal(page.selects(), 0);assert.equal(page.dataset.buddyPanel, undefined);
});

test('a selection DSH refuses never claims the panel, and the event does not throw', async t => {
  const page = await load(t, {selectFails: true});
  page.callbacks.get('main')();
  page.dataset.buddyPanel = PLUGIN;
  assert.doesNotThrow(() => page.open({pluginId: PLUGIN}));
  assert.equal(page.dataset.buddyPanel, undefined, 'a stale answer of ours is withdrawn');
  page.dataset.buddyPanel = '@ai-buddy/bilibili-companion';page.open({pluginId: PLUGIN});
  assert.equal(page.dataset.buddyPanel, '@ai-buddy/bilibili-companion', 'another plugin’s answer is left alone');
});

test('embedded header CSS hides the logo, title and subtitle and moves the actions to the tab row', async t => {
  const page = await load(t);
  page.callbacks.get('main')();
  page.mount(page.registered.get(KEY)).unmount();
  const style = page.styles.find(element => element.id === 'qq-style');
  assert.ok(style, 'the page injects its style sheet');
  const css = style.textContent;
  for (const rule of [
    '.qq-head{display:flex;',
    '.qq-tabrow>.qq-tabs,.qq-tabrow>.qq-steps{flex:1;min-width:0}',
    '.qq-tabrow>.qq-acts,.qq-tabrow.bare{display:none}',
    'html[data-buddy-embedded] .qq-head{display:none}',
    'html[data-buddy-embedded] .qq-tabrow.bare{display:flex;justify-content:flex-end}',
    'html[data-buddy-embedded] .qq-tabrow>.qq-acts{display:flex;flex:none;flex-wrap:nowrap;',
    'html[data-buddy-embedded] .qq-tabs+.qq-acts{border-bottom:1px solid var(--q-line)}',
    'html[data-buddy-embedded] .qq-tabrow>.qq-tabs{flex-wrap:wrap}',
  ]) assert.ok(css.includes(rule), rule);
});
