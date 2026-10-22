"""Small, dependency-free terminal presentation helpers."""
import os
import re
import shutil
import sys
import textwrap

PALETTE = {'cyan': '36', 'green': '32', 'gold': '33', 'muted': '2', 'bold': '1'}


def color_enabled():
    return sys.stdout.isatty() and 'NO_COLOR' not in os.environ and os.environ.get('TERM') != 'dumb'


def paint(text, style):
    return f'\033[{PALETTE[style]}m{text}\033[0m' if color_enabled() else text


def unicode_enabled():
    try:
        '╭─╮│╰╯█░'.encode(sys.stdout.encoding or 'utf-8')
        return os.environ.get('TERM') != 'dumb'
    except (UnicodeEncodeError, LookupError):
        return False


def width():
    return max(12, min(84, shutil.get_terminal_size((80, 24)).columns - 2))


def highlight(line):
    # Match after wrapping so escape sequences never affect width calculations.
    pattern = r'Ctrl-b(?: (?:Space|arrow|[a-z?%,"&]))?|python3 trainer\.py \w+'
    return re.sub(pattern, lambda match: paint(match.group(), 'cyan'), line)


def card(label, title, body, accent='cyan'):
    size = width()
    inner = size - 4
    unicode = unicode_enabled()
    tl, tr, bl, br, h, v = ('╭', '╮', '╰', '╯', '─', '│') if unicode else ('+', '+', '+', '+', '-', '|')
    print('\n' + paint(tl + h * (size - 2) + tr, accent))
    for text, style in [(label.upper(), accent), (title, 'bold'), ('', None), *[(line, None) for line in body.split('\n')]]:
        lines = textwrap.wrap(text, inner, replace_whitespace=False, drop_whitespace=True) or ['']
        for line in lines:
            content = paint(line, style) if style else highlight(line)
            print(paint(v, accent) + ' ' + content + ' ' * (inner - len(line)) + ' ' + paint(v, accent))
    print(paint(bl + h * (size - 2) + br, accent))


def progress_bar(done, total):
    filled = round(20 * done / total)
    full, empty = ('█', '░') if unicode_enabled() else ('#', '-')
    bar = paint(full * filled, 'green') + paint(empty * (20 - filled), 'muted')
    print(f'  {bar}  {done}/{total} complete')


def welcome():
    card('Meet your tmux coach', 'CAPTAIN PANE',
         'Your terminal. Your playground.\n'
         'Build muscle memory, one shortcut at a time.\n\n'
         'REAL SHELLS  /  GUIDED MISSIONS  /  SAVED PROGRESS\n\n'
         'Ctrl-b w  switch windows     Ctrl-b d  detach safely\n'
         'I’ll guide you from the coach window. Keep it open; run shell commands in practice.')
    print('  ' + paint('lesson', 'cyan') + ' instructions   ' + paint('check', 'green') +
          ' verify   ' + paint('plan', 'gold') + ' course map')


def notice(message, success=False):
    print('\n  ' + paint('PASS' if success else 'TRY AGAIN', 'green' if success else 'gold') + '  ' + message)
