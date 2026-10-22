const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Training, checkpoint } = require('../training.cjs');
const lessons = require('../lessons.json');

const columns = [30, 30, 30].map(width => ({ window: 'practice', width, top: 0, zoomed: false, mode: '' }));

test('twelve lessons have complete content, unique IDs, and prerequisite order', () => {
  assert.equal(lessons.length, 12);
  assert.equal(new Set(lessons.map(lesson => lesson.id)).size, 12);
  for (const lesson of lessons) {
    for (const key of ['id', 'title', 'topic', 'duration', 'intro', 'concept', 'tip', 'checkpoint']) {
      assert.ok(lesson[key], `${lesson.id}: ${key}`);
    }
    assert.ok(lesson.steps.length > 0);
    assert.ok(lesson.keys.every(pair => pair.length === 2));
  }
  const ids = lessons.map(lesson => lesson.id);
  assert.deepEqual(ids.slice(3, 9), ['split', 'layouts', 'resize', 'zoom', 'move-pane', 'close-pane']);
  assert.deepEqual(ids.slice(-3), ['close-window', 'copy-mode', 'detach']);
});

test('new checkpoints reject unrelated windows, stacked panes, and incomplete states', () => {
  assert.equal(checkpoint('layouts', { practice: 3 }, { panes: columns }), true);
  assert.equal(checkpoint('layouts', { practice: 2 }, { panes: columns.slice(0, 2) }), false);
  assert.equal(checkpoint('layouts', { practice: 3 }, { panes: columns.map((pane, top) => ({ ...pane, top })) }), false);
  assert.equal(checkpoint('layouts', { practice: 3 }, { panes: columns.map(pane => ({ ...pane, zoomed: true })) }), false);
  const resized = columns.map((pane, i) => ({ ...pane, width: i ? 25 : 40 }));
  assert.equal(checkpoint('resize', { practice: 3 }, { panes: resized }), true);
  assert.equal(checkpoint('resize', { practice: 3 }, { panes: columns }), false);
  assert.equal(checkpoint('zoom', { practice: 3 }, { panes: columns }), false);
  assert.equal(checkpoint('zoom', { practice: 3 }, { panes: [{ ...columns[0], zoomed: true }] }), true);
  assert.equal(checkpoint('move-pane', { journal: 2 }), false);
  assert.equal(checkpoint('move-pane', { practice: 1, journal: 1 }), false);
  assert.equal(checkpoint('move-pane', { practice: 1, journal: 2 }), true);
  assert.equal(checkpoint('copy-mode', {}, { panes: [{ ...columns[0], window: 'journal', mode: 'copy-mode' }] }), false);
  assert.equal(checkpoint('copy-mode', { practice: 1 }, { panes: [{ ...columns[0], mode: 'copy-mode' }] }), true);
  assert.equal(checkpoint('copy-mode', { practice: 1 }, { panes: [{ ...columns[0], mode: 'view-mode' }] }), false);
});

test('seven-mission profiles preserve all progress and unlock the first new lesson', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'captain-pane-upgrade-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const completed = ['basics', 'windows', 'rename', 'split', 'close-pane', 'close-window', 'detach'];
  const file = path.join(directory, 'progress.json');
  const original = JSON.stringify({ completed });
  fs.writeFileSync(file, original);
  const training = new Training(directory, null);
  assert.deepEqual(training.completed, completed);
  assert.equal(lessons[training.current()].id, 'layouts');
  assert.equal(training.state().completed.length, 7);
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'loading does not rewrite progress');
});
