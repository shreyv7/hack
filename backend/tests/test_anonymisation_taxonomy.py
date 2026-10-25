"""Tests for anonymisation technique taxonomy."""

import unittest

from app.models.anonymisation import AnonymisationTechnique
from app.utils.anonymisation_taxonomy import (
    is_true_anonymisation,
    technique_class,
    technique_class_label,
)


class AnonymisationTaxonomyTests(unittest.TestCase):
    def test_true_anonymisation_techniques(self) -> None:
        for t in (
            AnonymisationTechnique.k_anonymity,
            AnonymisationTechnique.l_diversity,
            AnonymisationTechnique.suppression,
            AnonymisationTechnique.generalization,
        ):
            self.assertEqual(technique_class(t), "true_anonymisation")
            self.assertTrue(is_true_anonymisation(t))
            self.assertIn("Irreversible", technique_class_label(t))

    def test_de_identification_techniques(self) -> None:
        for t in (
            AnonymisationTechnique.pseudonymization,
            AnonymisationTechnique.differential_privacy,
            AnonymisationTechnique.date_shifting,
        ):
            self.assertEqual(technique_class(t), "de_identification")
            self.assertFalse(is_true_anonymisation(t))
            self.assertIn("De-identification", technique_class_label(t))


if __name__ == "__main__":
    unittest.main()
