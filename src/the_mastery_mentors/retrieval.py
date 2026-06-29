from __future__ import annotations

import re
from collections import Counter
from typing import Any


TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")

STOPWORDS = {
    "a",
    "ad",
    "al",
    "alla",
    "allo",
    "and",
    "che",
    "da",
    "dal",
    "della",
    "di",
    "e",
    "i",
    "il",
    "in",
    "la",
    "le",
    "lo",
    "nel",
    "non",
    "o",
    "per",
    "sul",
    "su",
    "tra",
    "un",
    "una",
}


def tokenize(text: str) -> list[str]:
    tokens = [token.lower() for token in TOKEN_RE.findall(text)]
    return [token for token in tokens if token not in STOPWORDS]


def score_document(query_tokens: list[str], document: str) -> float:
    doc_tokens = tokenize(document)
    if not query_tokens or not doc_tokens:
        return 0.0

    query_counts = Counter(query_tokens)
    doc_counts = Counter(doc_tokens)

    score = 0.0
    for token, weight in query_counts.items():
        if token in doc_counts:
            score += min(weight, doc_counts[token])
    return score / max(len(doc_tokens), 1)


def retrieve_relevant_examples(
    query: str,
    examples: list[dict[str, Any]],
    limit: int = 5,
) -> list[dict[str, Any]]:
    query_tokens = tokenize(query)
    scored: list[tuple[float, dict[str, Any]]] = []
    for example in examples:
        text = " ".join(
            [
                str(example.get("bot_code", "")),
                str(example.get("bot_name", "")),
                str(example.get("user_text", "")),
                str(example.get("scenario", "")),
                str(example.get("assistant_headings", "")),
            ]
        )
        score = score_document(query_tokens, text)
        if score > 0:
            scored.append((score, example))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [example for _, example in scored[:limit]]

