import contextlib
import io
import os
import unittest
from unittest.mock import patch

import terminal_ui as ui


class PresentationTests(unittest.TestCase):
    def test_redirected_output_has_no_escapes(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            ui.welcome()
            ui.progress_bar(3, 7)
        self.assertNotIn('\033', output.getvalue())
        self.assertIn('CAPTAIN PANE', output.getvalue())
        self.assertIn('3/7 complete', output.getvalue())

    def test_no_color_overrides_tty(self):
        with patch.object(ui.sys.stdout, 'isatty', return_value=True):
            with patch.dict(os.environ, {'NO_COLOR': ''}):
                self.assertEqual(ui.paint('hello', 'cyan'), 'hello')

    def test_narrow_card_fits(self):
        output = io.StringIO()
        with patch.object(ui, 'width', return_value=30), contextlib.redirect_stdout(output):
            ui.card('Mission 01', 'A long title for a narrow terminal',
                    'Ctrl-b w selects windows. ' * 5)
        self.assertTrue(all(len(line) <= 30 for line in output.getvalue().splitlines()))

    def test_ascii_fallback(self):
        output = io.StringIO()
        with patch.dict(os.environ, {'TERM': 'dumb'}), contextlib.redirect_stdout(output):
            ui.card('mission', 'Practice', 'Try a split.')
            ui.progress_bar(1, 7)
        output.getvalue().encode('ascii')
        self.assertIn('+---', output.getvalue())
