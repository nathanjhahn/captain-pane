/* global Terminal, FitAddon */
const $ = id => document.getElementById(id);
let state;
let selected = 0;
let busy = false;
let everConnected = false;
const terminal = new Terminal({
  cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Monaco, monospace',
  lineHeight: 1.3, scrollback: 5000, allowProposedApi: false,
  theme: { background: '#0a1016', foreground: '#d5e1eb', cursor: '#a9e6c3',
    selectionBackground: '#35554f', black: '#17212b', red: '#ed9c9c', green: '#a9e6c3',
    yellow: '#edc58d', blue: '#8cbbe8', magenta: '#c9a8e8', cyan: '#81cbd8', white: '#d5e1eb',
    brightBlack: '#8194a5', brightRed: '#ffb5b5', brightGreen: '#c5f5d9', brightYellow: '#ffdcaa',
    brightBlue: '#acd5ff', brightMagenta: '#e0c3ff', brightCyan: '#a2e5f0', brightWhite: '#ffffff' },
});
const fit = new FitAddon.FitAddon();
terminal.loadAddon(fit);
terminal.open($('terminal'));
terminal.onData(data => { if (state?.connected) window.captain.write(data).catch(showError); });
window.captain.onData(data => terminal.write(data));
window.captain.onExit(next => {
  state = next;
  renderConnection();
  feedback('Detached. Your tmux session is still there — reconnect when you’re ready.', true);
});

function feedback(message, success = false) {
  $('feedback').textContent = message;
  $('feedback').className = success ? 'success' : '';
}
function showError(error) { feedback(error.message || String(error)); }
function fitTerminal() {
  fit.fit();
  if (state?.connected) window.captain.resize(terminal.cols, terminal.rows).catch(showError);
}
let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(fitTerminal);
}).observe($('terminal'));

function renderNavigation() {
  $('missions').replaceChildren();
  state.lessons.forEach((lesson, index) => {
    const complete = state.completed.includes(lesson.id);
    const button = document.createElement('button');
    button.className = 'mission-button' + (complete ? ' completed' : '');
    if (index === selected) button.setAttribute('aria-current', 'step');
    button.disabled = !complete && index !== state.current;
    button.title = button.disabled ? 'Complete earlier missions to unlock' : lesson.title;
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = complete ? '✓' : String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = lesson.topic;
    const subtitle = document.createElement('small');
    subtitle.textContent = complete ? 'Mission complete' : index === state.current ? 'Ready when you are' : lesson.duration;
    text.append(title, subtitle);
    button.append(number, text);
    button.addEventListener('click', () => { selected = index; feedback(''); render(); });
    $('missions').append(button);
  });
  $('missions').querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  $('progress').max = state.lessons.length;
  $('progress').value = state.completed.length;
  $('progress-label').textContent = `${state.completed.length} / ${state.lessons.length}`;
}

function renderLesson() {
  const complete = state.current < 0 && selected < 0;
  const lesson = complete ? {
    title: 'The terminal is yours, Captain.', duration: 'Well earned',
    intro: `${state.lessons.length} missions. A whole new way to work. You’ve learned to organize a workspace, arrange and move panes, explore scrollback, and leave without losing your place.`,
    concept: 'Your practice deck is now an open playground. Keep experimenting, or revisit a completed mission from the learning path.',
    steps: ['Create two windows for two different tasks.', 'Split one window, try a new layout, and move between panes.', 'Detach, take a break, and reconnect to pick up where you left off.'],
    keys: [['Ctrl-b w', 'Choose a window'], ['Ctrl-b d', 'Detach safely']],
    tip: 'A little daily practice beats memorizing every shortcut. Keep the ones you use; look up the rest with Ctrl-b ?.',
    checkpoint: 'Course complete. Revisit any mission, or enjoy free practice.',
  } : state.lessons[selected];
  $('mission-number').textContent = complete ? 'VOYAGE COMPLETE' : `MISSION ${String(selected + 1).padStart(2, '0')} / ${String(state.lessons.length).padStart(2, '0')}`;
  for (const key of ['duration', 'intro', 'concept', 'tip', 'checkpoint']) $(key).textContent = lesson[key];
  $('lesson-title').textContent = lesson.title;
  $('steps').replaceChildren(...lesson.steps.map(step => {
    const item = document.createElement('li'); item.textContent = step; return item;
  }));
  $('keys').replaceChildren(...lesson.keys.map(([shortcut, description]) => {
    const row = document.createElement('div'); row.className = 'key-row';
    const key = document.createElement('kbd'); key.textContent = shortcut;
    const text = document.createElement('span'); text.textContent = description;
    row.append(key, text); return row;
  }));
  const active = !complete && selected === state.current;
  $('check').textContent = complete ? 'All missions complete ✓' : active ? 'Check my work →' : 'Mission complete ✓';
  $('check').disabled = !active || busy || !state.installed;
}

function renderConnection() {
  $('terminal-overlay').hidden = state.connected;
  $('connection-label').textContent = state.connected ? 'Connected' : 'Detached';
  $('connection-dot').classList.toggle('connected', state.connected);
  $('connect').textContent = state.connected ? 'Focus terminal ↗' : everConnected || state.sessionExists ? 'Reconnect terminal' : 'Connect terminal';
  $('overlay-connect').textContent = state.sessionExists ? 'Reconnect terminal →' : 'Let’s set sail →';
  $('overlay-title').textContent = state.sessionExists ? 'Your workspace is still here.' : 'Your practice deck awaits.';
  $('overlay-copy').textContent = state.installed
    ? state.sessionExists ? 'Reconnect to the same windows and shells. Everything is right where you left it.'
      : 'Connect to open a real tmux session. Your lessons stay right here beside you.'
    : 'Captain Pane needs tmux installed. In your usual terminal, run: brew install tmux. Then reopen this app.';
  $('connect').disabled = busy || !state.installed;
  $('overlay-connect').disabled = busy || !state.installed;
  if (state.connected) requestAnimationFrame(fitTerminal);
}
function render() {
  renderNavigation();
  renderLesson();
  renderConnection();
}

async function connect() {
  if (busy) return;
  if (state.connected) { terminal.focus(); return; }
  busy = true; renderConnection();
  terminal.reset();
  try {
    state = await window.captain.connect();
    everConnected = true;
    feedback('Practice deck connected. Click the terminal before using tmux shortcuts.', true);
  } catch (error) { showError(error); }
  finally { busy = false; render(); fitTerminal(); terminal.focus(); }
}
$('connect').addEventListener('click', connect);
$('overlay-connect').addEventListener('click', connect);
$('check').addEventListener('click', async () => {
  if (busy) return;
  busy = true; renderLesson();
  try {
    const result = await window.captain.check();
    state = result.state;
    if (result.passed) {
      selected = state.current;
      $('lesson-content').scrollTop = 0;
    }
    feedback(result.message, result.passed);
  } catch (error) { showError(error); }
  finally { busy = false; render(); }
});
$('reset').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('reset').disabled = true;
  try {
    state = await window.captain.reset();
    selected = state.current;
    if (!state.connected) { terminal.reset(); everConnected = false; }
    feedback('');
  } catch (error) { showError(error); }
  finally { busy = false; $('reset').disabled = false; render(); }
});
window.captain.state().then(next => {
  state = next; selected = state.current; render();
}).catch(error => {
  showError(error);
  $('overlay-title').textContent = 'We hit a little rough water.';
  $('overlay-copy').textContent = error.message;
  $('connect').disabled = $('overlay-connect').disabled = $('check').disabled = true;
});
