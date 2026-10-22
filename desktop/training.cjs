const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const lessons = require('./lessons.json');

function findTmux() {
  const candidates = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux',
    ...(process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'tmux'))];
  return candidates.find(file => {
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  }) || null;
}

function checkpoint(id, windows, { connected = false, detached = false, panes = [] } = {}) {
  const practice = panes.filter(pane => pane.window === 'practice');
  const columns = practice.length >= 3 && practice.every(pane => !pane.zoomed && pane.top === practice[0].top);
  const widthDifference = practice.length ? Math.max(...practice.map(pane => pane.width)) - Math.min(...practice.map(pane => pane.width)) : 0;
  switch (id) {
    case 'basics': return connected && windows.practice > 0;
    case 'windows': return windows.notes > 0;
    case 'rename': return windows.journal > 0 && !windows.notes;
    case 'split': return windows.practice >= 2;
    case 'layouts': return columns && widthDifference <= 2;
    case 'resize': return columns && widthDifference >= 8;
    case 'zoom': return windows.practice >= 2 && practice.some(pane => pane.zoomed);
    case 'move-pane': return windows.journal >= 2 && windows.practice >= 1;
    case 'copy-mode': return practice.some(pane => pane.mode === 'copy-mode');
    case 'close-pane': return windows.practice === 1;
    case 'close-window': return !windows.journal && windows.practice > 0;
    case 'detach': return connected && detached;
    default: return false;
  }
}

class Training {
  constructor(directory, tmuxPath = findTmux()) {
    this.directory = directory;
    this.file = path.join(directory, 'progress.json');
    this.workspace = path.join(directory, 'Practice');
    this.tmuxPath = tmuxPath;
    this.socket = 'captain-pane-' + crypto.createHash('sha256').update(directory).digest('hex').slice(0, 16);
    this.completed = [];
    this.detached = false;
    fs.mkdirSync(this.workspace, { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        const { completed } = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!Array.isArray(completed) || completed.some(id => typeof id !== 'string')) throw new Error();
        this.completed = [...new Set(completed.filter(id => lessons.some(lesson => lesson.id === id)))];
      } catch {
        throw new Error(`Progress could not be read. Your file has not been changed: ${this.file}`);
      }
    }
  }

  run(args) {
    if (!this.tmuxPath) throw new Error('Install tmux with Homebrew: brew install tmux. Then reopen Captain Pane.');
    try {
      return execFileSync(this.tmuxPath, ['-L', this.socket, '-f', '/dev/null', ...args], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, TMUX: '', PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` },
      }).trim();
    } catch (error) {
      throw new Error(error.stderr?.toString().trim() || error.message);
    }
  }

  exists() {
    if (!this.tmuxPath) return false;
    try { this.run(['has-session', '-t', '=practice']); return true; } catch { return false; }
  }

  current() { return lessons.findIndex(lesson => !this.completed.includes(lesson.id)); }

  windows() {
    if (!this.exists()) return {};
    return Object.fromEntries(this.run(['list-windows', '-t', '=practice', '-F', '#{window_name}\t#{window_panes}'])
      .split('\n').map(line => { const [name, count] = line.split('\t'); return [name, Number(count)]; }));
  }

  panes() {
    if (!this.exists()) return [];
    return this.run(['list-panes', '-s', '-t', '=practice', '-F', '#{window_name}\t#{pane_width}\t#{pane_top}\t#{window_zoomed_flag}\t#{pane_mode}'])
      .split('\n').map(line => {
        const [window, width, top, zoomed, mode] = line.split('\t');
        return { window, width: Number(width), top: Number(top), zoomed: zoomed === '1', mode };
      });
  }

  ensureSession() {
    if (this.exists()) {
      this.run(['set-window-option', '-g', 'mode-keys', 'emacs']);
      return;
    }
    this.detached = false;
    this.run(['new-session', '-d', '-s', 'practice', '-n', 'practice', '-c', this.workspace, '-x', '100', '-y', '30']);
    this.run(['set-window-option', '-g', 'automatic-rename', 'off']);
    this.run(['set-window-option', '-g', 'mode-keys', 'emacs']);
    this.run(['set-option', '-g', 'status-style', 'bg=colour235,fg=colour252']);
    this.run(['set-option', '-g', 'status-left', '#[fg=colour117,bold] CAPTAIN PANE  #[default]']);
    this.run(['set-option', '-g', 'status-left-length', '20']);
    this.run(['set-option', '-g', 'status-right', '#[fg=colour150] C-b w: windows | C-b d: detach ']);
    this.run(['set-window-option', '-g', 'window-status-current-style', 'fg=colour232,bg=colour150,bold']);
  }

  state(connected = false) {
    return { lessons, completed: this.completed, current: this.current(), connected,
      installed: Boolean(this.tmuxPath), sessionExists: this.exists(), windows: this.windows(),
      workspace: this.workspace };
  }

  check(connected) {
    const index = this.current();
    if (index < 0) return { passed: true, message: 'All missions complete. The terminal is yours, Captain.' };
    const lesson = lessons[index];
    const passed = this.exists() && checkpoint(lesson.id, this.windows(), { connected, detached: this.detached, panes: this.panes() });
    if (passed) {
      const completed = [...this.completed, lesson.id];
      const temp = this.file + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ completed }, null, 2) + '\n');
      fs.renameSync(temp, this.file);
      this.completed = completed;
    }
    return { passed, message: passed ? (lesson.id === 'basics' ? 'Sea legs acquired! Orientation marked complete (self-assessed).' : 'Nicely done. Mission accomplished!')
      : `Not quite yet. ${lesson.checkpoint}` };
  }

  reset() {
    if (this.exists()) this.run(['kill-server']);
    fs.rmSync(this.file, { force: true });
    this.completed = [];
    this.detached = false;
  }
}

module.exports = { Training, checkpoint, findTmux };
