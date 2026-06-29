from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class Serializable:
    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class BotProfile(Serializable):
    bot_code: str
    bot_name: str
    area: str = "B"
    examples_count: int = 0
    metrics: dict[str, float] = field(default_factory=dict)
    tactical_tags: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    preferred_side: str = "unknown"
    source_examples: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class AreaBConfig(Serializable):
    name: str = "Area B"
    area: str = "B"
    focus: str = "Only Area B"
    wind_gradient: dict[str, str] = field(default_factory=dict)
    shore_effects: dict[str, str] = field(default_factory=dict)
    wind_features: dict[str, str] = field(default_factory=dict)
    reference_points: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    screenshot_basis: dict[str, Any] = field(default_factory=dict)
    tactical_base: dict[str, Any] = field(default_factory=dict)
    tactical_variants: list[dict[str, Any]] = field(default_factory=list)
    bot_roster: list[dict[str, Any]] = field(default_factory=list)
    course_model: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class TacticalRule(Serializable):
    label: str
    trigger: str
    action: str
    priority: int = 0


@dataclass(slots=True)
class SimulationRequest(Serializable):
    area: str = "B"
    wind_mode: str = "Ora"
    scenario: str = ""
    focus_question: str = ""
    active_bots: list[str] = field(default_factory=list)
    wind_map: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ContextBundle(Serializable):
    area_b: AreaBConfig
    bot_profiles: list[BotProfile]
    tactical_priors: dict[str, Any] = field(default_factory=dict)
    request: SimulationRequest | None = None
    retrieved_examples: list[dict[str, Any]] = field(default_factory=list)
