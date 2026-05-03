"""Normalize Supabase-related env vars (Dashboard + Create React App names)."""
from __future__ import annotations

import os
import re
from typing import Optional

_REF_RE = re.compile(r"https://([a-z0-9-]+)\.supabase\.co", re.IGNORECASE)


def apply_supabase_env_aliases() -> None:
    """Map REACT_APP_* into canonical names so FastAPI can reuse the same .env.local as CRA."""
    url = (os.environ.get("REACT_APP_SUPABASE_URL") or "").strip()
    if url and not (os.environ.get("SUPABASE_URL") or "").strip():
        os.environ["SUPABASE_URL"] = url
    key = (os.environ.get("REACT_APP_SUPABASE_PUBLISHABLE_KEY") or "").strip()
    if key and not (os.environ.get("SUPABASE_ANON_KEY") or "").strip():
        os.environ["SUPABASE_ANON_KEY"] = key
    legacy = (os.environ.get("REACT_APP_SUPABASE_ANON_KEY") or "").strip()
    if legacy and not (os.environ.get("SUPABASE_ANON_KEY") or "").strip():
        os.environ["SUPABASE_ANON_KEY"] = legacy


def project_ref_from_env() -> Optional[str]:
    for k in ("SUPABASE_URL", "REACT_APP_SUPABASE_URL"):
        u = (os.environ.get(k) or "").strip()
        m = _REF_RE.search(u)
        if m:
            return m.group(1).lower()
    return None


def supabase_url_and_key() -> tuple[str, str]:
    import os as _os

    apply_supabase_env_aliases()
    url = (_os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = (_os.environ.get("SUPABASE_ANON_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_PUBLISHABLE_KEY "
            "(or SUPABASE_URL and SUPABASE_ANON_KEY) in backend/.env or .env.local."
        )
    return url, key
