from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Sync engine para FastAPI com connection pooling otimizado
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Verifica conexão antes de usar
    echo=settings.DEBUG,

    # OTIMIZAÇÃO: Connection pooling para produção
    pool_size=20,  # Conexões mantidas abertas (default: 5)
    max_overflow=40,  # Conexões extras quando pool cheio (default: 10)
    pool_recycle=3600,  # Recicla conexões a cada 1 hora (evita stale connections)
    pool_timeout=30,  # Timeout ao aguardar conexão do pool (segundos)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency para pegar sessão do banco."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
