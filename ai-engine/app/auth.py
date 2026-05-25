from fastapi import Header, HTTPException, status
from .config import settings


def verify_ai_engine_key(
    x_ai_engine_key: str | None = Header(default=None, alias="X-AI-Engine-Key"),
) -> None:
    if not settings.AI_ENGINE_KEY:
        return
    if x_ai_engine_key != settings.AI_ENGINE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid X-AI-Engine-Key",
        )


def require_tenant_id(
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-Id"),
) -> str:
    if not x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missing X-Tenant-Id header",
        )
    return x_tenant_id
