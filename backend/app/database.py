from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text, inspect

DATABASE_URL = "sqlite:///./chat.db"
engine = create_engine(DATABASE_URL, echo=True)


def _add_column_if_missing(conn, table: str, column: str, col_type: str, default=None):
    """Safely add a column to an existing table if it doesn't exist."""
    inspector = inspect(conn)
    existing = [c["name"] for c in inspector.get_columns(table)]
    if column not in existing:
        default_clause = f" DEFAULT {default}" if default is not None else ""
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause}"))


def init_db():
    SQLModel.metadata.create_all(engine)

    # Migrate existing tables — add encryption columns
    with engine.connect() as conn:
        # User.public_key
        _add_column_if_missing(conn, "user", "public_key", "TEXT")

        # Message encryption fields
        _add_column_if_missing(conn, "message", "is_encrypted", "BOOLEAN", "0")
        _add_column_if_missing(conn, "message", "nonce", "TEXT")
        _add_column_if_missing(conn, "message", "sender_public_key", "TEXT")

        # DirectMessage encryption fields
        _add_column_if_missing(conn, "directmessage", "is_encrypted", "BOOLEAN", "0")
        _add_column_if_missing(conn, "directmessage", "nonce", "TEXT")
        _add_column_if_missing(conn, "directmessage", "sender_public_key", "TEXT")

        # Role.is_default field
        _add_column_if_missing(conn, "role", "is_default", "BOOLEAN", "0")

        # ServerKey.encrypted_by — tracks who encrypted the key for proper decryption
        _add_column_if_missing(conn, "serverkey", "encrypted_by", "INTEGER")

        conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
