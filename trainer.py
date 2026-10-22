#!/usr/bin/env python3
"""A dependency-free trainer using a dedicated, disposable tmux server."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

import terminal_ui as ui

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.tmux-practice' / 'progress.json'
SOCKET = 'tmux-practice-' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
SESSION = 'practice'

LESSONS = [
    ('basics', 'Meet sessions, windows, and panes', '''A session is a workspace. Windows are tabs inside it; panes split a window.
You are reading this in the coach window. The practice window has a real shell.

The default prefix is Ctrl-b: press Ctrl and b together, RELEASE both,
then press the next key. Do not hold Ctrl for the second key.

Try these:
  Ctrl-b w       choose a window using arrow keys, then Enter
  Ctrl-b n       next window
  Ctrl-b p       previous window
  Ctrl-b ?       show key bindings (press q to leave)

Visit the practice window, run pwd, and return to coach using Ctrl-b w.
This orientation is self-assessed: check confirms that you tried it.'''),
    ('windows', 'Create a window', '''Go to practice with Ctrl-b w, then:
  Ctrl-b c       create a new window with a shell
  Ctrl-b ,       rename the current window; type notes and press Enter

Run a command such as echo "my notes" in that window.
Return to coach with Ctrl-b w, then check.
Checkpoint: a window named notes exists.'''),
    ('rename', 'Rename and navigate', '''Select the notes window with Ctrl-b w.
  Ctrl-b ,       rename it to journal
  Ctrl-b l       toggle to the previously selected window (lowercase L)

Try Ctrl-b n and Ctrl-b p, then return to coach.
Checkpoint: journal exists and notes no longer exists.'''),
    ('split', 'Split a window into panes', '''Select the practice window (do not split coach).
  Ctrl-b %       split left/right
  Ctrl-b "       split top/bottom
  Ctrl-b arrow   move focus to an adjacent pane
  Ctrl-b o       move to the next pane
  Ctrl-b z       zoom/unzoom the focused pane
  Ctrl-b Space   cycle layouts

Make at least one split. Try moving between panes and running pwd in each.
Return to coach using Ctrl-b w.
Checkpoint: practice contains at least two panes.'''),
    ('close-pane', 'Close panes safely', '''Select practice and unzoom if necessary with Ctrl-b z.
In each extra pane, type exit to close its shell.
Keep ONE pane in practice alive. Do not close the coach window.

Alternative: Ctrl-b x asks before killing the focused pane.
Closing a pane ends the programs running in it. Use only these test shells.
Return to coach when practice has exactly one pane.
Checkpoint: practice still exists with exactly one pane.'''),
    ('close-window', 'Close a window', '''Select journal and type exit in its shell.
A window disappears when its last pane exits.

Alternative: Ctrl-b & asks before killing the entire window.
Never use that shortcut on a window with work you want to keep.
Return to coach using Ctrl-b w.
Checkpoint: journal is gone; practice still exists.'''),
    ('detach', 'Detach and reconnect', '''A detached session keeps running even when your terminal disconnects.
  Ctrl-b d       detach (do this now)

Back in your ORIGINAL terminal, run:
  python3 trainer.py check
  python3 trainer.py start

The first command verifies that this session has no attached clients.
The second reconnects you to the same windows and shells.
Do not type exit to detach: exit closes the shell instead.'''),
]


def tmux(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    if not shutil.which('tmux'):
        raise RuntimeError('tmux is not installed. On macOS: brew install tmux; on Ubuntu: sudo apt install tmux')
    return subprocess.run(['tmux', '-L', SOCKET, '-f', '/dev/null', *args],
                          text=True, capture_output=True, check=check)


def exists() -> bool:
    return tmux('has-session', '-t', SESSION, check=False).returncode == 0


def progress() -> list[str]:
    if not STATE.exists():
        return []
    try:
        data = json.loads(STATE.read_text())
        completed = data['completed']
        if not isinstance(completed, list) or not all(isinstance(x, str) for x in completed):
            raise ValueError('invalid completed list')
        return completed
    except (ValueError, KeyError, TypeError) as exc:
        raise RuntimeError(f'Cannot read {STATE}. Back it up and run reset to start over.') from exc


def save(completed: list[str]) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'completed': completed}, indent=2) + '\n')
    temporary.replace(STATE)


def current() -> int:
    completed = progress()
    return next((i for i, lesson in enumerate(LESSONS) if lesson[0] not in completed), len(LESSONS))


def windows() -> dict[str, int]:
    result = tmux('list-windows', '-t', SESSION, '-F', '#{window_name}\t#{window_panes}')
    return {name: int(count) for name, count in (line.split('\t') for line in result.stdout.splitlines())}


def checkpoint(lesson: str, wins: dict[str, int], attached: int) -> bool:
    return {
        'basics': True,
        'windows': 'notes' in wins,
        'rename': 'journal' in wins and 'notes' not in wins,
        'split': wins.get('practice', 0) >= 2,
        'close-pane': wins.get('practice') == 1,
        'close-window': 'journal' not in wins and 'practice' in wins,
        'detach': attached == 0,
    }[lesson]


def show_lesson() -> None:
    index = current()
    if index == len(LESSONS):
        ui.card('Course complete', 'Your terminal just got a little bigger.',
                'You can create, organize, split, and reconnect to your workspace.\n\n'
                'Next challenge: create two windows, split one, navigate, then detach.\n'
                'Reattach any time for free practice, or use python3 trainer.py reset '
                'outside tmux to restart the course.', accent='green')
        ui.progress_bar(len(LESSONS), len(LESSONS))
        return
    _, title, text = LESSONS[index]
    ui.card(f'Mission {index + 1:02d} / {len(LESSONS):02d}', title, text)
    ui.progress_bar(len(set(progress()) & {lesson[0] for lesson in LESSONS}), len(LESSONS))
    print('  ' + ui.paint('Return here and type check when ready.', 'muted'))


def check_lesson() -> None:
    index = current()
    if index == len(LESSONS):
        print('All lessons are complete.')
        return
    if not exists():
        print('No practice session. Run python3 trainer.py start first.')
        return
    attached = int(tmux('display-message', '-p', '-t', SESSION, '#{session_attached}').stdout.strip())
    key = LESSONS[index][0]
    if checkpoint(key, windows(), attached):
        completed = progress()
        save(completed + [key])
        ui.notice('Checkpoint passed. Nicely done!' if key != 'basics' else
                  'Orientation complete (self-assessed). Let’s build something.', success=True)
        show_lesson()
    else:
        ui.notice('Not quite yet. Follow the checkpoint in the lesson and try again.')
        print('Current windows:', ', '.join(f'{name} ({n} pane(s))' for name, n in windows().items()))


def coach() -> None:
    ui.welcome()
    show_lesson()
    while True:
        try:
            command = input('\n' + ui.paint('  Captain Pane', 'cyan') + ui.paint(' > ', 'bold')).strip().lower()
            if command == 'check':
                check_lesson()
            elif command == 'plan':
                plan()
            elif command in ('', 'lesson', 'help'):
                show_lesson()
            else:
                print('Use lesson, check, or plan. Shell commands belong in the practice window.')
        except (EOFError, KeyboardInterrupt):
            print('\nUse Ctrl-b d to detach; Captain Pane will be here when you return.')


def start() -> None:
    if os.environ.get('TMUX'):
        raise RuntimeError('Run start from a terminal OUTSIDE tmux (detach with Ctrl-b d first). '
                           'This avoids nesting tmux sessions and conflicting prefixes.')
    if not exists():
        command = shlex.join([sys.executable, str(Path(__file__).resolve()), '_coach'])
        tmux('new-session', '-d', '-s', SESSION, '-n', 'coach', '-c', str(ROOT), command)
        tmux('set-option', '-t', SESSION, 'status-style', 'bg=colour235,fg=colour252')
        tmux('set-option', '-t', SESSION, 'status-left-length', '24')
        tmux('set-option', '-t', SESSION, 'status-left',
             '#[bg=colour37,fg=colour232,bold] CAPTAIN PANE #[default] ')
        tmux('set-option', '-t', SESSION, 'status-right',
             '#[fg=colour117] C-b w: windows  #[fg=colour150]C-b d: detach ')
        tmux('set-window-option', '-g', 'window-status-format', ' #I:#W ')
        tmux('set-window-option', '-g', 'window-status-current-format',
             '#[fg=colour232,bg=colour150,bold] #I:#W #[default]')
        tmux('set-window-option', '-g', 'automatic-rename', 'off')
        tmux('new-window', '-t', f'{SESSION}:', '-n', 'practice', '-c', str(ROOT))
        tmux('select-window', '-t', f'{SESSION}:coach')
    result = subprocess.run(['tmux', '-L', SOCKET, 'attach-session', '-t', SESSION])
    if result.returncode:
        raise RuntimeError('Could not attach. Run start in an interactive terminal.')
    print('Detached. Your training session is still running.\n'
          'Run python3 trainer.py check for the detach checkpoint, or start to reconnect.')


def plan() -> None:
    completed = progress()
    active = current()
    rows = []
    for i, (key, title, _) in enumerate(LESSONS):
        marker = '[x]' if key in completed else '[>]' if i == active else '[ ]'
        rows.append(f'{marker}  {i + 1:02d}  {title}')
    ui.card('The learning path', 'Small steps. Real terminal confidence.', '\n'.join(rows))
    ui.progress_bar(len(set(completed) & {lesson[0] for lesson in LESSONS}), len(LESSONS))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', nargs='?', default='start',
                        choices=['start', 'lesson', 'plan', 'status', 'check', 'reset', '_coach'])
    args = parser.parse_args()
    try:
        if args.command == 'start':
            start()
        elif args.command == '_coach':
            coach()
        elif args.command == 'lesson':
            show_lesson()
        elif args.command in ('plan', 'status'):
            plan()
        elif args.command == 'check':
            check_lesson()
        elif args.command == 'reset':
            if input('Destroy ONLY this project’s training session and progress? Type reset: ') == 'reset':
                tmux('kill-server', check=False)
                STATE.unlink(missing_ok=True)
                print('Training reset. Run python3 trainer.py start to begin again.')
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(f'Error: {exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) else exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
