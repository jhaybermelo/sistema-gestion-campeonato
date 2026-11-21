from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite por defecto (archivo en backend/data). Para PostgreSQL:
    # postgresql+asyncpg://usuario:clave@localhost:5432/campeonato
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/campeonato.db"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    # Sesiones. Si SECRET_KEY está vacío se genera una vez y se guarda en data/secret.key.
    SECRET_KEY: str = ""
    TOKEN_HORAS: int = 12
    # Administrador inicial (solo se crea si no existe ningún usuario).
    # Si ADMIN_PASSWORD está vacío se genera una clave aleatoria y se imprime en el log.
    ADMIN_USER: str = "admin"
    ADMIN_PASSWORD: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
