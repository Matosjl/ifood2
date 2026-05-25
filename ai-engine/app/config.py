import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    PORT: int = int(os.getenv("PORT", "3001"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")

    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2-vision:11b-q4_K_M")
    OLLAMA_REQUEST_TIMEOUT: int = int(os.getenv("OLLAMA_REQUEST_TIMEOUT", "120"))
    # Modelos pequenos (moondream) não suportam format=json — desabilite explicitamente
    OLLAMA_FORMAT_JSON: bool = os.getenv("OLLAMA_FORMAT_JSON", "true").lower() == "true"

    AI_ENGINE_KEY: str = os.getenv("AI_ENGINE_KEY", "")

    MAX_CONCURRENT_VISION: int = int(os.getenv("MAX_CONCURRENT_VISION", "2"))

    IMAGE_MAX_SIDE_PX: int = int(os.getenv("IMAGE_MAX_SIDE_PX", "1024"))
    IMAGE_JPEG_QUALITY: int = int(os.getenv("IMAGE_JPEG_QUALITY", "85"))


settings = Settings()
