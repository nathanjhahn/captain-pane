import contextlib
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import uuid

import trainer


class ProgressTests(unittest.TestCase):
    def test_progress_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(trainer, 'STATE', Path(directory) / 'progress.json'):
                self.assertEqual(trainer.current(), 0)
                trainer.save(['basics'])
                self.assertEqual(trainer.current(), 1)
                trainer.STATE.write_text('broken')
                with self.assertRaises(RuntimeError):
                    trainer.progress()

    def test_checkpoints(self):
        self.assertTrue(trainer.checkpoint('split', {'practice': 2}, 1))
        self.assertFalse(trainer.checkpoint('split', {'practice': 1}, 1))
        self.assertFalse(trainer.checkpoint('close-pane', {}, 1))
        self.assertFalse(trainer.checkpoint('rename', {'notes': 1, 'journal': 1}, 1))
        self.assertFalse(trainer.checkpoint('close-window', {}, 1))
        self.assertFalse(trainer.checkpoint('detach', {}, 1))
        self.assertTrue(trainer.checkpoint('detach', {}, 0))


@unittest.skipUnless(shutil.which('tmux'), 'tmux required')
class TmuxIntegrationTests(unittest.TestCase):
    def test_full_course_state_transitions(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(trainer, 'SOCKET', 'trainer-test-' + uuid.uuid4().hex), \
                 patch.object(trainer, 'STATE', Path(directory) / 'progress.json'):
                try:
                    trainer.tmux('new-session', '-d', '-s', trainer.SESSION, '-n', 'practice', '-x', '100', '-y', '30')
                    with contextlib.redirect_stdout(io.StringIO()):
                        trainer.check_lesson()
                        self.assertEqual(trainer.current(), 1)
                        trainer.check_lesson()  # missing notes must fail
                        self.assertEqual(trainer.current(), 1)
                        trainer.tmux('new-window', '-d', '-t', f'{trainer.SESSION}:', '-n', 'notes')
                        trainer.check_lesson()
                        trainer.tmux('rename-window', '-t', 'practice:notes', 'journal')
                        trainer.check_lesson()
                        pane = trainer.tmux('split-window', '-d', '-t', 'practice:practice', '-P', '-F', '#{pane_id}').stdout.strip()
                        trainer.check_lesson()
                        trainer.tmux('kill-pane', '-t', pane)
                        trainer.check_lesson()
                        trainer.tmux('kill-window', '-t', 'practice:journal')
                        trainer.check_lesson()
                        trainer.check_lesson()  # server has no attached clients
                        self.assertEqual(trainer.current(), len(trainer.LESSONS))
                finally:
                    trainer.tmux('kill-server', check=False)


if __name__ == '__main__':
    unittest.main()
