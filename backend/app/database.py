import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text, inspect

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./chat.db")
engine = create_engine(DATABASE_URL, echo=True)


def add_column_if_missing(conn, table: str, column: str, col_type: str, default=None):
    #Safely add a column to an existing table if it doesn't exist.
    inspector = inspect(conn)
    existing = [c["name"] for c in inspector.get_columns(table)]
    if column not in existing:
        default_clause = f" DEFAULT {default}" if default is not None else ""
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause}"))


def init_db():
    SQLModel.metadata.create_all(engine)

    # Migrate existing tables
    with engine.connect() as conn:
        # User.public_key
        add_column_if_missing(conn, "user", "public_key", "TEXT")

        # Message encryption fields
        add_column_if_missing(conn, "message", "is_encrypted", "BOOLEAN", "0")
        add_column_if_missing(conn, "message", "nonce", "TEXT")
        add_column_if_missing(conn, "message", "sender_public_key", "TEXT")

        # DirectMessage encryption fields
        add_column_if_missing(conn, "directmessage", "is_encrypted", "BOOLEAN", "0")
        add_column_if_missing(conn, "directmessage", "nonce", "TEXT")
        add_column_if_missing(conn, "directmessage", "sender_public_key", "TEXT")

        # Role.is_default field
        add_column_if_missing(conn, "role", "is_default", "BOOLEAN", "0")

        # ServerKey.encrypted_by — tracks who encrypted the key for decryption
        add_column_if_missing(conn, "serverkey", "encrypted_by", "INTEGER")

        # Message.attachment_id and DirectMessage.attachment_id — file attachments
        add_column_if_missing(conn, "message", "attachment_id", "INTEGER")
        add_column_if_missing(conn, "directmessage", "attachment_id", "INTEGER")

        # Attachment sender self-decryption fields for DM file attachments
        add_column_if_missing(conn, "attachment", "sender_file_key_encrypted", "TEXT")
        add_column_if_missing(conn, "attachment", "sender_file_key_nonce", "TEXT")

        # AI summary cache fields
        add_column_if_missing(conn, "message", "ai_summary", "TEXT")
        add_column_if_missing(conn, "message", "ai_thinking", "TEXT")
        add_column_if_missing(conn, "directmessage", "ai_summary", "TEXT")
        add_column_if_missing(conn, "directmessage", "ai_thinking", "TEXT")

        # User bio
        add_column_if_missing(conn, "user", "bio", "TEXT")

        # Server slow mode
        add_column_if_missing(conn, "server", "slow_mode_seconds", "INTEGER", "0")

        # Message replies
        add_column_if_missing(conn, "message", "reply_to_id", "INTEGER")
        add_column_if_missing(conn, "directmessage", "reply_to_id", "INTEGER")

        conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
