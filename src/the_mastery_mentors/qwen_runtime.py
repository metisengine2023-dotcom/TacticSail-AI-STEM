from __future__ import annotations

import os
import platform
from dataclasses import dataclass
from typing import Any, Iterable

from .context_builder import build_messages
from .schemas import ContextBundle


DEFAULT_MLX_MODEL_ID = "mlx-community/Qwen3.5-4B-MLX-4bit"
DEFAULT_TRANSFORMERS_MODEL_ID = "Qwen/Qwen3.5-4B"
SUPPORTED_BACKENDS = {"auto", "mlx", "transformers"}


@dataclass
class RuntimeBundle:
    backend: str
    model: Any
    tokenizer: Any
    device: Any = None
    model_id: str = ""


def _normalize_messages(messages: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    return [{"role": item["role"], "content": item["content"]} for item in messages]


def _is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine().lower() in {"arm64", "aarch64"}


def resolve_backend(backend: str | None = None) -> str:
    selected = (backend or os.environ.get("QWEN_BACKEND") or "auto").strip().lower()
    if selected not in SUPPORTED_BACKENDS:
        raise ValueError(f"Unsupported QWEN_BACKEND={selected!r}. Use auto, mlx, or transformers.")
    if selected != "auto":
        return selected
    return "mlx" if _is_apple_silicon() else "transformers"


def load_quantized_model(model_id: str | None = None) -> tuple[Any, Any]:
    model_name = (
        model_id
        or os.environ.get("QWEN_MLX_MODEL_ID")
        or os.environ.get("QWEN_MODEL_ID")
        or DEFAULT_MLX_MODEL_ID
    )

    try:
        from mlx_lm import load
    except ImportError as exc:  # pragma: no cover - runtime dependency guard
        raise RuntimeError("Install mlx-lm before using the quantized Qwen runtime helper.") from exc

    model, tokenizer = load(model_name)
    return model, tokenizer


def generate_quantized_response(
    messages: list[dict[str, str]],
    model_id: str | None = None,
    max_tokens: int = 256,
) -> Any:
    return generate_response(messages, model_id=model_id, max_tokens=max_tokens)


def _select_torch_device(torch: Any) -> tuple[Any, Any]:
    if torch.cuda.is_available():
        return torch.device("cuda"), torch.float16
    try:
        import torch_directml
    except ImportError:
        torch_directml = None
    if platform.system() == "Windows" and torch_directml is not None:
        return torch_directml.device(), torch.float32
    return torch.device("cpu"), torch.float32


def _apply_chat_template(tokenizer: Any, messages: list[dict[str, str]], **kwargs: Any) -> Any:
    try:
        return tokenizer.apply_chat_template(messages, enable_thinking=False, **kwargs)
    except TypeError:
        return tokenizer.apply_chat_template(messages, **kwargs)


def load_base_model(model_id: str | None = None) -> tuple[Any, Any]:
    runtime = load_transformers_model(model_id=model_id)
    return runtime.tokenizer, runtime.model


def load_transformers_model(model_id: str | None = None) -> RuntimeBundle:
    model_name = (
        model_id
        or os.environ.get("QWEN_TRANSFORMERS_MODEL_ID")
        or os.environ.get("QWEN_MODEL_ID")
        or DEFAULT_TRANSFORMERS_MODEL_ID
    )

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - runtime dependency guard
        raise RuntimeError(
            "Install transformers and torch before using the Qwen runtime helper."
        ) from exc

    device, torch_dtype = _select_torch_device(torch)
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch_dtype,
        trust_remote_code=True,
    )
    model.to(device)
    model.eval()
    return RuntimeBundle(
        backend="transformers",
        model=model,
        tokenizer=tokenizer,
        device=device,
        model_id=model_name,
    )


def load_auto_model(model_id: str | None = None, backend: str | None = None) -> RuntimeBundle:
    selected_backend = resolve_backend(backend)
    if selected_backend == "mlx":
        model_name = (
            model_id
            or os.environ.get("QWEN_MLX_MODEL_ID")
            or os.environ.get("QWEN_MODEL_ID")
            or DEFAULT_MLX_MODEL_ID
        )
        model, tokenizer = load_quantized_model(model_id=model_name)
        return RuntimeBundle(
            backend="mlx",
            model=model,
            tokenizer=tokenizer,
            model_id=model_name,
        )
    return load_transformers_model(model_id=model_id)


def generate_with_runtime(
    runtime: RuntimeBundle,
    messages: list[dict[str, str]],
    max_tokens: int = 256,
) -> str:
    normalized = _normalize_messages(messages)
    if runtime.backend == "mlx":
        from mlx_lm import generate

        prompt = _apply_chat_template(
            runtime.tokenizer,
            normalized,
            tokenize=False,
            add_generation_prompt=True,
        )
        return generate(runtime.model, runtime.tokenizer, prompt=prompt, max_tokens=max_tokens)

    import torch

    inputs = _apply_chat_template(
        runtime.tokenizer,
        normalized,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    )
    inputs = inputs.to(runtime.device)
    with torch.inference_mode():
        outputs = runtime.model.generate(
            inputs,
            max_new_tokens=max_tokens,
            do_sample=False,
            pad_token_id=runtime.tokenizer.eos_token_id,
        )
    generated = outputs[0][inputs.shape[-1] :]
    return runtime.tokenizer.decode(generated, skip_special_tokens=True).strip()


def generate_response(
    messages: list[dict[str, str]],
    model_id: str | None = None,
    max_tokens: int = 256,
    backend: str | None = None,
) -> str:
    runtime = load_auto_model(model_id=model_id, backend=backend)
    return generate_with_runtime(runtime, messages=messages, max_tokens=max_tokens)


def render_chat_prompt(bundle: ContextBundle) -> list[dict[str, str]]:
    return build_messages(bundle)
