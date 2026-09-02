"""
This service's own settings — separate from (and not a replacement for) the
bridged consulate-rag-chatbot `app.core.config.Settings`, which the reused
pipeline/retrieval/generation code reads on its own via its own get_settings().

This file only holds config that is specific to the kb-admin service itself:
where to find the sibling repo, placeholder admin credentials, and
scheduler/eval knobs added in later phases.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    log_level: str = "INFO"

    consulate_rag_chatbot_path: str = "../consulate-rag-chatbot"

    # TODO: replace with real per-staff auth once login method is decided
    # (options: individual username/password per staff member, or
    # Google/Microsoft SSO) — this is still a single shared admin/password
    # pair, just no longer sent on every request. See kb_admin/core/auth.py.
    admin_username: str = "admin"
    admin_password: str = "change_me_dev_only"

    # --- JWT session tokens (POST /auth/login) ---
    # A fixed dev default so tokens survive a backend restart in local dev;
    # set a real random value in production .env so restarting the server
    # doesn't silently invalidate every issued token, and so the signing
    # key isn't guessable from this public source file.
    jwt_secret_key: str = "change_me_jwt_secret_dev_only"
    jwt_expiry_hours: int = 24

    # --- Phase 3: scheduled source recheck ---
    recheck_interval_days: int = 7

    # --- Phase 4: evaluation module ---
    # "gemini" reuses the same GEMINI_API_KEY already configured below for
    # answer_question() itself (free tier, zero incremental cost) — see
    # kb_admin/eval/judge.py's docstring for the self-preference-bias
    # trade-off this accepts (Gemini judging Gemini-generated answers).
    # "anthropic" is also supported (needs eval_judge_api_key set) if that
    # trade-off ever needs revisiting.
    eval_judge_provider: str = "gemini"
    eval_judge_model: str = "gemini-2.5-flash"
    eval_judge_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
