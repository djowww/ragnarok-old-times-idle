"""Validate the release workflow's publication trust boundaries."""
from pathlib import Path
import re
import unittest

import yaml


class ReleaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / '.github/workflows/release.yml'
        cls.workflow = yaml.load(path.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        cls.jobs = cls.workflow['jobs']

    def prerequisites(self, name):
        needs = self.jobs[name].get('needs', [])
        if isinstance(needs, str):
            needs = [needs]
        return set(needs).union(*(self.prerequisites(need) for need in needs))

    def test_gitleaks_is_a_mandatory_publication_prerequisite(self):
        scans = []
        for name in self.prerequisites('publish'):
            job = self.jobs[name]
            for step in job.get('steps', []):
                command = step.get('run', '')
                if re.search(r'"?\$RUNNER_TEMP/gitleaks"? git\b', command):
                    scans.append((name, job, step, command))
        self.assertTrue(scans, 'No Gitleaks scan gates publication')
        for name, job, step, command in scans:
            self.assertNotIn('if', job, name)
            self.assertNotIn('if', step, name)
            self.assertNotEqual(job.get('continue-on-error'), 'true', name)
            self.assertNotEqual(step.get('continue-on-error'), 'true', name)
            self.assertIn('set -euo pipefail', command)
            self.assertIn('--log-opts=--all', command)
            self.assertIn('--redact=100', command)
            self.assertNotRegex(command, r'\|\|\s*true|--exit-code[= ]0')
            checkout = next(s for s in job['steps'] if s.get('uses', '').startswith('actions/checkout@'))
            self.assertEqual(checkout.get('with', {}).get('fetch-depth'), '0')

    def test_publish_guard_allows_main_and_rejects_manual_branch_and_tag_refs(self):
        expression = self.jobs['publish'].get('if', '').strip()
        if expression.startswith('${{') and expression.endswith('}}'):
            expression = expression[3:-2].strip()
        # Keep the boundary simple enough to audit; no success()/always() override.
        match = re.fullmatch(r"github\.ref\s*==\s*'([^']+)'", expression)
        self.assertIsNotNone(match, 'Publish requires a main-only ref guard')
        for ref, expected in [('refs/heads/main', True), ('refs/heads/feature', False),
                              ('refs/tags/main', False), ('refs/tags/v1.2.3', False)]:
            with self.subTest(ref=ref):
                self.assertEqual(ref == match.group(1), expected)

    def test_publish_keeps_success_required_for_all_validation_jobs(self):
        self.assertTrue({'verify', 'windows'} <= self.prerequisites('publish'))
        # A ref-only job condition retains Actions' implicit success() gating.
        self.assertNotRegex(self.jobs['publish'].get('if', ''), r'always\(|failure\(|cancelled\(')

    def test_push_cannot_publish_from_a_correction_branch(self):
        triggers = self.workflow['on']
        self.assertEqual(triggers['push']['branches'], ['main'])
        self.assertEqual(triggers['push']['paths'], ['VERSION'])
        for event in ['pull_request', 'pull_request_target', 'workflow_run', 'create']:
            self.assertNotIn(event, triggers)


if __name__ == '__main__':
    unittest.main()
