const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

module.exports = async ({ app, window, training, getTerminal }) => {
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 3) errors.push(event.message);
  });
  const evaluate = script => window.webContents.executeJavaScript(script);
  const until = async (predicate, description) => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await delay(100);
    }
    throw new Error('Timed out: ' + description);
  };
  const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  const checkpoint = async expected => {
    await click('check');
    await until(() => (training.state().lessons[training.current()]?.id || 'complete') === expected, 'mission ' + expected);
  };
  const type = text => { assert.ok(getTerminal(), 'PTY connected'); getTerminal().write(text); };
  const command = async text => {
    type('\x02:'); await delay(150); type(text + '\r'); await delay(600);
  };
  try {
    await until(() => evaluate("document.querySelectorAll('.mission-button').length === 12"), 'renderer loaded');
    assert.equal(await evaluate("document.querySelectorAll('[aria-current=step]').length"), 1);
    await click('overlay-connect');
    await until(() => getTerminal() && evaluate("document.getElementById('terminal-overlay').hidden"), 'PTY connected');
    await until(() => evaluate("document.querySelector('.xterm-screen').textContent.includes('CAPTAIN')"), 'terminal output rendered');
    await checkpoint('windows');
    type('\x02c');
    await until(() => Object.keys(training.windows()).length === 2, 'window created with keyboard');
    type('\x02,'); await delay(100); type('\x15notes\r');
    await until(() => training.windows().notes === 1, 'window named notes');
    await checkpoint('rename');
    type('\x02,'); await delay(100); type('\x15journal\r');
    await until(() => training.windows().journal === 1, 'window renamed journal');
    await checkpoint('split');
    // Select practice through the tmux command prompt; then split with its shortcut.
    type('\x02:'); await delay(150); type('select-window -t practice:practice\r'); await delay(600);
    type('\x02%');
    await until(() => training.windows().practice === 2, 'pane split');
    await checkpoint('layouts');
    type('\x02%');
    await until(() => training.windows().practice === 3, 'three panes');
    await command('select-layout even-horizontal');
    await checkpoint('resize');
    await command('select-pane -t practice:practice.0');
    await command('resize-pane -R 10');
    await checkpoint('zoom');
    type('\x02z');
    await until(() => training.panes().some(pane => pane.window === 'practice' && pane.zoomed), 'pane zoomed');
    await checkpoint('move-pane');
    type('\x02z'); await delay(150);
    type('export MOVED_ABOARD=ahoy\r'); await delay(150);
    await command('join-pane -h -t practice:journal');
    await until(() => training.windows().journal === 2, 'pane moved to journal');
    await checkpoint('close-pane');
    await command('select-window -t practice:practice');
    type('exit\r');
    await until(() => training.windows().practice === 1, 'pane closed');
    await checkpoint('close-window');
    type('\x02:'); await delay(150); type('select-window -t practice:journal\r'); await delay(600);
    type('echo $MOVED_ABOARD\r'); await delay(150);
    await until(() => evaluate("document.querySelector('.xterm-screen').textContent.includes('ahoy')"), 'moved shell state preserved');
    type('exit\r');
    await until(() => training.windows().journal === 1, 'moved pane closed');
    type('exit\r');
    await until(() => !training.windows().journal, 'window closed');
    await checkpoint('copy-mode');
    type('i=1; while [ "$i" -le 80 ]; do echo "Captain Pane log $i"; i=$((i+1)); done\r');
    await delay(300);
    type('\x02[');
    await until(() => training.panes().some(pane => pane.mode === 'copy-mode'), 'copy mode entered');
    await checkpoint('detach');
    type('q'); await delay(150);
    type('export CAPTAIN_PANE=ahoy\r'); await delay(100);
    type('\x02d');
    await until(() => !getTerminal(), 'keyboard detach');
    assert.ok(training.exists(), 'session survives detach');
    assert.ok(training.detached, 'detach recorded');
    await click('overlay-connect');
    await until(() => Boolean(getTerminal()), 'reconnect');
    type('echo $CAPTAIN_PANE\r');
    await until(() => evaluate("document.querySelector('.xterm-screen').textContent.includes('ahoy')"), 'same shell state after reconnect');
    await checkpoint('complete');
    await until(() => evaluate("document.getElementById('lesson-title').textContent.includes('yours')"), 'completion screen');
    // Revisit a lesson to capture the working desktop layout.
    await evaluate("document.querySelectorAll('.mission-button')[3].click()");
    window.setSize(1440, 960);
    await delay(300);
    assert.equal(await evaluate('typeof window.require'), 'undefined', 'renderer has no Node access');
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'no horizontal overflow');
    const screenshot = app.isPackaged ? path.join(app.getPath('userData'), 'desktop-smoke.png')
      : path.join(__dirname, '..', 'artifacts', 'desktop-smoke.png');
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
    window.setSize(1050, 740);
    await delay(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'minimum window fits');
    assert.deepEqual(errors, [], 'no renderer console errors');
    assert.equal(await evaluate('document.querySelector("main").getBoundingClientRect().bottom <= innerHeight'), true, 'main fits vertically');
    assert.equal(await evaluate('document.querySelector(".terminal-footer").getBoundingClientRect().bottom <= innerHeight'), true, 'terminal shortcuts visible');
    console.log('Desktop smoke passed: renderer, real PTY keyboard exercises, all twelve checkpoints, detach/reconnect, responsive layout.');
    console.log('Screenshot: ' + screenshot);
    training.reset();
    app.exit(0);
  } catch (error) {
    console.error(error);
    try {
      console.error('Windows:', training.windows());
      console.error(training.run(['capture-pane', '-p', '-t', 'practice:']));
    } catch {}
    try { training.reset(); } catch {}
    app.exit(1);
  }
};
