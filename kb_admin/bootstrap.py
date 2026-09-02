"""
Makes the sibling consulate-rag-chatbot project's `app` package importable
from this process, without installing it as a package (it has no
pyproject.toml/setup.py) and without copying any of its code.

Must be imported before anything in this codebase does `import app...`.
kb_admin's own code is intentionally *not* named `app`, precisely so that
name stays unambiguous once this path is on sys.path.
"""

import importlib.machinery
import sys
import types
from pathlib import Path

from dotenv import dotenv_values

_THIS_DIR = Path(__file__).resolve().parent.parent
_env_values = dotenv_values(_THIS_DIR / ".env")
_configured_path = _env_values.get("CONSULATE_RAG_CHATBOT_PATH") or "../consulate-rag-chatbot"

CHATBOT_REPO_PATH = (_THIS_DIR / _configured_path).resolve()

if not (CHATBOT_REPO_PATH / "app").is_dir():
    raise RuntimeError(
        f"CONSULATE_RAG_CHATBOT_PATH does not point at a valid consulate-rag-chatbot "
        f"checkout (no 'app' package found under {CHATBOT_REPO_PATH}). Set "
        f"CONSULATE_RAG_CHATBOT_PATH in kb_admin's .env to the correct path."
    )

if str(CHATBOT_REPO_PATH) not in sys.path:
    sys.path.insert(0, str(CHATBOT_REPO_PATH))


def _preempt_broken_datasets_import() -> None:
    """The bridged app.embedding.bge_m3 already stubs sys.modules["datasets"]
    with a bare types.ModuleType when the real package's import fails (e.g.
    pyarrow's `_dataset` DLL blocked by a corporate Application Control
    policy) -- see that file's own docstring, not reproduced/modified here.
    That bare stub has two gaps a bare types.ModuleType doesn't cover:
    (1) it has no __spec__, and transformers' own import chain (a
    FlagEmbedding dependency) calls importlib.util.find_spec("datasets")
    rather than a bare import, which raises `ValueError: datasets.__spec__
    is None` against a spec-less stub on Python 3.12; (2)
    FlagEmbedding.abc.finetune.embedder.AbsDataset references
    `datasets.Dataset` in a function *signature annotation* inside a class
    body -- evaluated eagerly at class-definition time even though the
    fine-tuning method itself is never called -- so a stub with no
    `Dataset` name raises AttributeError before BGEM3FlagModel even
    finishes importing. Pre-populating the stub here, with a real
    (loader=None) ModuleSpec and a dummy `Dataset` placeholder, before the
    sibling's own stub-if-missing check runs, avoids both crashes without
    touching the sibling repo. No-op if the real package imports fine."""
    if "datasets" in sys.modules:
        return
    try:
        import datasets  # noqa: F401
    except Exception:
        stub = types.ModuleType("datasets")
        stub.__spec__ = importlib.machinery.ModuleSpec("datasets", loader=None)
        stub.Dataset = type("Dataset", (), {})
        sys.modules["datasets"] = stub


_preempt_broken_datasets_import()
