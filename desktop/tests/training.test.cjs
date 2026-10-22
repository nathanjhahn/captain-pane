const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Training, checkpoint, findTmux } = require('../training.cjs');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'captain-pane-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('checkpoints validate actual state and require detach plus reconnect', () => {
  assert.equal(checkpoint('windows', { notes: 1 }), true);
  assert.equal(checkpoint('rename', { notes: 1, journal: 1 }), false);
  assert.equal(checkpoint('split', { practice: 2 }), true);
  assert.equal(checkpoint('split', { practice: 1 }), false);
  assert.equal(checkpoint('close-pane', {}), false);
  assert.equal(checkpoint('close-window', {}), false);
  assert.equal(checkpoint('basics', { practice: 1 }, { connected: false }), false);
  assert.equal(checkpoint('detach', {}, { detached: true, connected: false }), false);
  assert.equal(checkpoint('detach', {}, { detached: false, connected: true }), false);
  assert.equal(checkpoint('detach', {}, { detached: true, connected: true }), true);
});

test('missing tmux gives actionable guidance without losing progress', t => {
  const training = new Training(temporary(t), null);
  assert.equal(training.state().installed, false);
  assert.throws(() => training.ensureSession(), /brew install tmux/);
  assert.equal(training.check(false).passed, false);
});

test('corrupt progress is preserved and reported', t => {
  const directory = temporary(t);
  const file = path.join(directory, 'progress.json');
  fs.writeFileSync(file, 'not json');
  assert.throws(() => new Training(directory), /has not been changed/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'not json');
});

test('progress ignores unknown IDs and deduplicates valid ones', t => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, 'progress.json'), JSON.stringify({ completed: ['basics', 'basics', 'unknown'] }));
  const training = new Training(directory);
  assert.deepEqual(training.completed, ['basics']);
  assert.equal(training.current(), 1);
});

test('real tmux course, persistence, and isolated reset', { skip: !findTmux() }, t => {
  const directory = temporary(t);
  const training = new Training(directory);
  const other = new Training(temporary(t));
  t.after(() => { training.reset(); other.reset(); });
  training.ensureSession();
  other.ensureSession();
  assert.deepEqual(training.windows(), { practice: 1 });
  assert.equal(training.check(false).passed, false);
  assert.equal(training.check(true).passed, true);
  training.run(['new-window', '-d', '-t', 'practice:', '-n', 'notes']);
  assert.equal(training.check(true).passed, true);
  training.run(['rename-window', '-t', 'practice:notes', 'journal']);
  assert.equal(training.check(true).passed, true);
  const pane = training.run(['split-window', '-d', '-t', 'practice:practice', '-P', '-F', '#{pane_id}']);
  assert.equal(training.check(true).passed, true);
  assert.equal(training.state().lessons[training.current()].id, 'layouts');
  assert.equal(training.check(true).passed, false, 'two panes are not enough for layouts');
  training.run(['split-window', '-d', '-t', 'practice:practice']);
  training.run(['select-layout', '-t', 'practice:practice', 'even-horizontal']);
  assert.equal(training.check(true).passed, true);
  assert.equal(training.check(true).passed, false, 'equal widths do not pass resizing');
  training.run(['resize-pane', '-t', 'practice:practice.0', '-R', '10']);
  assert.equal(training.check(true).passed, true);
  assert.equal(training.check(true).passed, false, 'zoom must be enabled');
  training.run(['resize-pane', '-t', 'practice:practice.0', '-Z']);
  assert.equal(training.check(true).passed, true);
  training.run(['resize-pane', '-t', 'practice:practice.0', '-Z']);
  assert.equal(training.check(true).passed, false, 'journal needs a second pane');
  training.run(['join-pane', '-h', '-s', pane, '-t', 'practice:journal']);
  assert.equal(training.check(true).passed, true);
  training.run(['kill-pane', '-t', 'practice:practice.1']);
  assert.equal(training.check(true).passed, true);
  training.run(['kill-window', '-t', 'practice:journal']);
  assert.equal(training.check(true).passed, true);
  assert.equal(training.check(true).passed, false, 'must enter copy mode');
  training.run(['copy-mode', '-t', 'practice:practice']);
  assert.equal(training.check(true).passed, true);
  training.run(['send-keys', '-t', 'practice:practice', '-X', 'cancel']);
  assert.equal(training.check(true).passed, false);
  training.detached = true;
  assert.equal(training.check(true).passed, true);
  const resumed = new Training(directory);
  assert.equal(resumed.current(), -1);
  assert.equal(resumed.completed.length, 12);
  training.reset();
  assert.equal(training.exists(), false);
  assert.equal(other.exists(), true, 'other server survives reset');
  assert.deepEqual(training.completed, []);
});
