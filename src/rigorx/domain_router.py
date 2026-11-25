"""Contextual activation for the historical 36-domain inventory.

Domain names are stored with provenance/canonical status. Keyword activation is
only a transparent heuristic; it is not semantic classification.
"""
from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class DomainCatalogError(ValueError):
    """Invalid domain catalogue."""


@dataclass(frozen=True, slots=True)
class KnowledgeDomain:
    domain_id: str
    name: str
    keywords: tuple[str, ...]
    source_status: str
    canonical_status: str


@dataclass(frozen=True, slots=True)
class DomainActivation:
    domain_id: str
    name: str
    matched_keywords: tuple[str, ...]
    score: int

    def to_dict(self) -> dict[str, object]:
        return {
            "domain_id": self.domain_id,
            "name": self.name,
            "matched_keywords": list(self.matched_keywords),
            "score": self.score,
        }


class DomainCatalog:
    def __init__(self, data: Mapping[str, Any], *, expected_count: int = 36) -> None:
        domains = data.get("domains")
        if not isinstance(domains, list) or len(domains) != expected_count:
            raise DomainCatalogError(f"Expected {expected_count} domain records")
        if data.get("inventory_count") != expected_count:
            raise DomainCatalogError("Inventory count mismatch")
        self.source_status = str(data.get("source_status", "UNSPECIFIED"))
        self.canonical_status = str(data.get("canonical_status", "UNSPECIFIED"))
        parsed: list[KnowledgeDomain] = []
        ids: set[str] = set()
        for item in domains:
            if not isinstance(item, dict):
                raise DomainCatalogError("Domain entry must be an object")
            domain_id = str(item.get("id", ""))
            name = str(item.get("name", ""))
            keywords = item.get("keywords")
            if not re.fullmatch(r"KD-[0-9]{2}", domain_id) or domain_id in ids:
                raise DomainCatalogError(f"Invalid or duplicate domain ID: {domain_id}")
            if not name.strip() or not isinstance(keywords, list) or not keywords:
                raise DomainCatalogError(f"Domain {domain_id} missing name/keywords")
            if any(not isinstance(k, str) or not k.strip() for k in keywords):
                raise DomainCatalogError(f"Domain {domain_id} has invalid keyword")
            ids.add(domain_id)
            parsed.append(KnowledgeDomain(domain_id, name, tuple(k.casefold() for k in keywords), self.source_status, self.canonical_status))
        if ids != {f"KD-{i:02d}" for i in range(1, expected_count + 1)}:
            raise DomainCatalogError("Domain IDs must be complete KD-01..KD-36")
        self.domains = tuple(parsed)

    @classmethod
    def from_file(cls, path: str | Path) -> DomainCatalog:
        try:
            with Path(path).open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            raise DomainCatalogError(f"Cannot load domain catalog: {type(exc).__name__}") from None
        if not isinstance(data, dict):
            raise DomainCatalogError("Domain catalog must be an object")
        return cls(data)


class DomainRouter:
    def __init__(self, catalog: DomainCatalog, *, max_activations: int = 8) -> None:
        if isinstance(max_activations, bool) or not isinstance(max_activations, int) or not 1 <= max_activations <= 36:
            raise ValueError("max_activations must be between 1 and 36")
        self.catalog = catalog
        self.max_activations = max_activations

    def activate(self, text: str) -> tuple[DomainActivation, ...]:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("activation text must be non-empty")
        normalized = text.casefold()
        results: list[DomainActivation] = []
        for domain in self.catalog.domains:
            matches = tuple(
                keyword for keyword in domain.keywords
                if re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", normalized)
            )
            if matches:
                results.append(DomainActivation(domain.domain_id, domain.name, matches, len(matches)))
        results.sort(key=lambda item: (-item.score, item.domain_id))
        return tuple(results[:self.max_activations])
