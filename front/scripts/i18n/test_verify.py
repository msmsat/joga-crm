"""Regression tests for strict CRM locale verification.

Run from ``front/``: ``python scripts/i18n/test_verify.py``.
Each test changes only a disposable locale tree; production locale files are
never fixtures for the validator's failure cases.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import lib
import verify


class StrictLocaleVerificationTests(unittest.TestCase):
    """Every test names the broken production behavior it must catch."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "locales"
        self.old_src = lib.SRC
        lib.SRC = str(self.root)

    def tearDown(self):
        lib.SRC = self.old_src
        self.tmp.cleanup()

    def write(self, lang: str, namespace: str, value: object) -> Path:
        path = self.root / lang / f"{namespace}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return path

    def source(self, value: object) -> None:
        self.write("en", "common", value)

    def test_financial_category_values_cannot_be_translated(self):
        self.write('en', 'finances', {'operations': {'categoryPresets': {
            'out': [{'value': 'Возвраты', 'label': 'Refunds'}]}}})
        problems = lib.check('fr', 'finances', {
            'operations.categoryPresets.out.0.value': 'Remboursements',
            'operations.categoryPresets.out.0.label': 'Remboursements',
        })
        self.assertTrue(any('immutable' in p for p in problems), problems)

    def test_stray_backslash_before_translated_line_break_is_rejected(self):
        self.source({'title': 'First\nSecond'})
        problems = lib.check('fr', 'common', {'title': 'Premier\\\nDeuxième'})
        self.assertTrue(any('backslash' in p for p in problems), problems)

    def test_duplicate_json_key_is_rejected_instead_of_silently_overwritten(self):
        """Changing an earlier duplicate must not be hidden by ``json.load``."""
        self.source({"label": "English"})
        duplicate = self.root / "cs" / "common.json"
        duplicate.parent.mkdir(parents=True, exist_ok=True)
        duplicate.write_text('{"label":"A", "label":"B"}', encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "duplicate key"):
            lib.load("cs", "common")

    def test_empty_translation_is_rejected_when_source_has_text(self):
        """A finished locale cannot disguise a missing translation as an empty key."""
        self.source({"label": "Save"})

        problems = lib.check("cs", "common", {"label": ""})

        self.assertTrue(any("empty" in problem for problem in problems), problems)

    def test_reversed_react_i18next_tags_are_rejected(self):
        """A tag sequence with the same token multiset must still stay balanced."""
        self.source({"message": "Read <0>the terms</0>"})

        problems = lib.check("cs", "common", {"message": "Přečtěte </0>podmínky<0>"})

        self.assertTrue(any("tag" in problem for problem in problems), problems)

    def test_object_replacing_source_array_is_rejected(self):
        """Flattened leaf paths must not hide a list-versus-object mismatch."""
        self.source({"items": ["First"]})

        target = {"items": {"0": "První"}}
        problems = lib.check("cs", "common", lib.flatten(target), tree=target)

        self.assertTrue(any("structure" in problem for problem in problems), problems)

    def test_missing_required_plural_form_is_reported(self):
        """Czech requires ``few`` rather than falling through to English."""
        self.source({"visits_one": "{{count}} visit", "visits_other": "{{count}} visits"})

        problems = lib.check("cs", "common", {
            "visits_one": "{{count}} návštěva",
            "visits_other": "{{count}} návštěv",
        })

        self.assertTrue(any("visits" in problem and "few" in problem for problem in problems), problems)

    def test_count_bearing_source_key_accepts_language_specific_plural_forms(self):
        """A bare English count key may legitimately become inflected Czech forms."""
        self.source({"months": "{{count}} mo"})

        problems = lib.check("cs", "common", {
            "months_one": "{{count}} měsíc",
            "months_few": "{{count}} měsíce",
            "months_other": "{{count}} měsíců",
        })

        self.assertEqual(problems, [])

    def test_valid_locale_passes_all_strict_checks(self):
        """A structurally correct Czech locale with all forms remains accepted."""
        self.source({
            "message": "Read <0>{{name}}</0>",
            "items": ["First"],
            "visits_one": "{{count}} visit",
            "visits_other": "{{count}} visits",
        })

        problems = lib.check("cs", "common", {
            "message": "Přečtěte <0>{{name}}</0>",
            "items.0": "První",
            "visits_one": "{{count}} návštěva",
            "visits_few": "{{count}} návštěvy",
            "visits_other": "{{count}} návštěv",
        })

        self.assertEqual(problems, [])

    def test_missing_namespace_makes_verifier_fail(self):
        """A language directory without an English namespace is a hard error."""
        self.source({"label": "Save"})
        (self.root / "cs").mkdir(parents=True)

        problems = verify.verify_all(self.root, languages=("en", "cs"))

        self.assertEqual(problems, ["cs/common.json: missing required file"])

    def test_missing_required_language_directory_is_reported(self):
        """Deleting an entire supported locale cannot make the check look green."""
        self.source({"label": "Save"})

        problems = verify.verify_all(self.root, languages=("en", "cs"))

        self.assertEqual(problems, ["cs/: missing required language directory"])

    def test_dump_writes_utf8_tsv_for_source_with_non_console_characters(self):
        """A source string containing × must not abort a Windows TSV export."""
        result = subprocess.run(
            [sys.executable, str(HERE / "dump.py"), "landing"],
            cwd=HERE.parents[2], capture_output=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        rendered = result.stdout.decode("utf-8")
        self.assertIn("#### landing (", rendered)
        self.assertIn("×", rendered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
