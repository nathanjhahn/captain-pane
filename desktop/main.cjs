const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const pty = require('node-pty');
const { Training } = require('./training.cjs');

app.setName('Captain Pane');
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'captain-pane-smoke-')));
if (!app.requestSingleInstanceLock()) app.quit();
let window;
let training;
let terminal;
let closing = false;

function send(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}
function state() { return training.state(Boolean(terminal)); }
function stopTerminal() {
  if (terminal) { const previous = terminal; terminal = null; previous.kill(); }
}
function connect() {
  if (terminal) return state();
  training.ensureSession();
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor',
    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}` };
  delete env.TMUX;
  delete env.TMUX_PANE;
  delete env.ELECTRON_RUN_AS_NODE;
  const spawned = pty.spawn(training.tmuxPath, ['-L', training.socket, 'attach-session', '-t', '=practice'], {
    name: 'xterm-256color', cols: 100, rows: 30, cwd: training.workspace, env,
  });
  terminal = spawned;
  spawned.onData(data => send('terminal:data', data));
  spawned.onExit(({ exitCode }) => {
    if (terminal !== spawned) return;
    terminal = null;
    if (!closing && exitCode === 0 && training.exists() && training.current() >= 0 &&
        training.state().lessons[training.current()].id === 'detach') training.detached = true;
    if (!closing) send('terminal:exit', state());
  });
  return state();
}

function registerIPC() {
  const handle = (name, callback) => ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Untrusted request');
    }
    return callback(...args);
  });
  handle('training:state', () => state());
  handle('training:connect', connect);
  handle('training:check', () => ({ ...training.check(Boolean(terminal)), state: state() }));
  handle('training:reset', async () => {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['Cancel', 'Reset training'], defaultId: 0, cancelId: 0,
      message: 'Start a fresh voyage?',
      detail: 'This ends all programs in Captain Pane’s training session and clears desktop lesson progress. Your normal tmux sessions and files are not affected.',
    });
    if (response === 1) { stopTerminal(); training.reset(); }
    return state();
  });
  handle('terminal:input', data => {
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Invalid terminal input');
    terminal?.write(data);
  });
  handle('terminal:resize', (cols, rows) => {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1 || cols > 1000 || rows > 500) return;
    terminal?.resize(cols, rows);
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1050, minHeight: 740,
    title: 'Captain Pane', backgroundColor: '#0d131a', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { stopTerminal(); window = null; });
  await window.loadFile(path.join(__dirname, 'index.html'));
}

app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.whenReady().then(async () => {
  try {
    training = new Training(app.getPath('userData'));
    registerIPC();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Captain Pane', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    await createWindow();
    if (smoke) await require('./smoke.cjs')({ app, window, training, getTerminal: () => terminal });
  } catch (error) {
    if (smoke) { console.error(error); app.exit(1); }
    else { dialog.showErrorBox('Captain Pane could not start', error.message); app.quit(); }
  }
});
app.on('activate', () => { if (!window && training) createWindow(); });
app.on('before-quit', () => { closing = true; stopTerminal(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
