# Captain Pane

### Your terminal. Your playground.

**A standalone macOS app that teaches you tmux by doing.** Captain Pane puts guided lessons beside a real, built-in terminal. No switching apps, no pretend terminal, no memorizing a wall of shortcuts.

- **One workspace** — a learning path, mission cards, and a live tmux terminal side by side.
- **Real practice** — create windows, split panes, and detach using actual tmux shortcuts.
- **A little momentum** — checkpoints, saved progress, and twelve approachable missions.
- **A friendly guide** — Captain Pane offers tips and a fresh challenge at every step.
- **Local by design** — no accounts, remote service, or CDN. Lessons and terminal stay on your Mac.

## Open the standalone app

A local Apple Silicon build is available after building at:

```text
dist/mac-arm64/Captain Pane.app
```

Double-click it in Finder, or launch it with:

```sh
open "dist/mac-arm64/Captain Pane.app"
```

You can copy the app to `/Applications`. It runs independently of this project directory and does **not** need Python or Node.js installed to run. It does need **tmux** installed on your Mac:

```sh
brew install tmux
```

The current build is for local development: it is not Developer ID signed or notarized. Distribution to other Macs will require signing/notarization; macOS may flag unsigned downloaded copies. The build targets the architecture of the Mac building it (Apple Silicon here).

## Build or run from source

Requires macOS, Node.js 22+ with npm, tmux, and Xcode Command Line Tools for native dependency builds (`xcode-select --install`).

```sh
npm install
npm start             # open the desktop app in development
npm run build:mac     # build a standalone .app under dist/
```

The committed `desktop/icon.icns` is used for the app icon. To regenerate it on macOS:

```sh
npm run icon:mac
```

The app uses Electron, xterm.js, and node-pty. Native dependencies are rebuilt for Electron during install and packaging. If Electron is updated, run `npm install` again before starting.

## Your first voyage (~35 minutes)

1. Open Captain Pane and click **Let's set sail**.
2. Click the terminal area before using shortcuts.
3. Follow the mission on the left, then click **Check my work**.
4. Completed missions remain available for review. Future missions unlock in order.

**The prefix is a sequence:** press **Ctrl-b**, release both keys, then press the next key. For example, **Ctrl-b**, then **w** opens the window chooser. When renaming, use **Ctrl-u** at tmux's prompt to clear the old name first.

| Mission | Skill | Checkpoint |
| --- | --- | --- |
| Find your sea legs | Sessions, windows, panes, help | Connect and self-assess orientation |
| Open a new horizon | Create a window | `notes` exists |
| Chart your workspace | Rename and navigate | `journal` exists; `notes` is gone |
| Divide and conquer | Split, focus, zoom, layouts | `practice` has at least two panes |
| Give every pane a berth | Arrange layouts | Three or more equal-width columns in `practice` |
| Make room for the big job | Resize panes | Side-by-side columns have noticeably different widths |
| Bring one task into focus | Zoom a pane | `practice` is zoomed with multiple panes |
| Move a task to a new berth | Move panes between windows | `journal` has at least two panes; `practice` remains |
| Keep a tidy deck | Close panes safely | `practice` has exactly one pane |
| Travel light | Close a window | `journal` is gone; `practice` remains |
| Look back over the wake | Scrollback and copy mode | A pane in `practice` is in copy mode |
| Leave. Return. Carry on. | Detach and reconnect | Detach using the keyboard, then reconnect |

Checks inspect resulting tmux state, not every keystroke. Navigation and help are self-guided; layouts, resizing, zoom, and copy mode now have dedicated state-based checkpoints. The first checkpoint is explicitly self-assessed. Keep the window name `practice` unchanged. Use **Ctrl-b :** to enter tmux commands such as `select-layout` and `join-pane`, not your shell prompt. Press **q** to leave copy mode after its checkpoint.

**Upgrading from the seven-mission course?** Your completed lesson IDs are preserved. The new missions unlock in course order; previously completed missions remain available. If `journal` is already gone, the move-pane mission explains how to recreate it. No reset is needed.

## Persistence and safety

- **Close the app or detach:** your dedicated tmux server and shells keep running. Reopen and reconnect to resume. A computer restart still ends processes.
- **Progress:** saved to `~/Library/Application Support/Captain Pane/progress.json` separately from running shells. The final detach exercise must be performed during the current app run.
- **Practice folder:** new shells start in `~/Library/Application Support/Captain Pane/Practice`.
- **Isolation:** the desktop app uses its own named tmux socket and standard configuration. It never attaches to or resets your normal tmux sessions, or the original Python trainer's session.
- **Real shell, not a sandbox:** terminal commands can still modify files on your Mac. Only practice destructive tmux shortcuts on test shells.
- **Reset:** “Start a fresh voyage” asks for confirmation, ends the desktop training session and its programs, and clears desktop progress. It does not delete practice files.
- **Recovery:** if you accidentally close or rename `practice`, or restart your Mac midway through a course whose checkpoints depend on earlier windows, reset for a fresh session.

## Tests

```sh
npm test                  # checkpoint, persistence, missing-tmux, and real-tmux integration tests
npm run test:desktop      # opens a temporary app instance and exercises all missions through a real PTY
python3 -m unittest discover -s tests -v  # original CLI tests
```

The desktop smoke test uses a temporary profile and isolated tmux server, sends keyboard input, checks rendered terminal output, verifies detach/reconnect and layout, and writes a screenshot to `artifacts/desktop-smoke.png`. It does not alter normal app progress. It requires a graphical macOS login session.

To smoke-test the packaged app:

```sh
"dist/mac-arm64/Captain Pane.app/Contents/MacOS/Captain Pane" --smoke-test
```

For packaged smoke tests, the screenshot goes in the temporary test profile printed by the test.

## Original terminal trainer

The original dependency-free Python trainer is still available as an alternative:

```sh
python3 trainer.py start
```

Run it from a terminal outside tmux. It retains its own project-local `.tmux-practice/progress.json`; desktop progress is independent and is not automatically imported. See `python3 trainer.py --help` for commands.
