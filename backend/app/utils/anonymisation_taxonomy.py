"""Legal/product taxonomy for anonymisation techniques."""

from app.models.anonymisation import AnonymisationTechnique

TRUE_ANONYMISATION_TECHNIQUES = frozenset(
    {
        AnonymisationTechnique.k_anonymity,
        AnonymisationTechnique.l_diversity,
        AnonymisationTechnique.suppression,
        AnonymisationTechnique.generalization,
    }
)

DE_IDENTIFICATION_TECHNIQUES = frozenset(
    {
        AnonymisationTechnique.differential_privacy,
        AnonymisationTechnique.pseudonymization,
        AnonymisationTechnique.date_shifting,
    }
)


def technique_class(technique: AnonymisationTechnique) -> str:
    if technique in TRUE_ANONYMISATION_TECHNIQUES:
        return "true_anonymisation"
    return "de_identification"


def technique_class_label(technique: AnonymisationTechnique) -> str:
    if technique in TRUE_ANONYMISATION_TECHNIQUES:
        return "Irreversible anonymisation"
    return "De-identification (may remain personal data)"


def is_true_anonymisation(technique: AnonymisationTechnique) -> bool:
    return technique in TRUE_ANONYMISATION_TECHNIQUES
