"""
Input sanitisation helpers.
Uses ``html.escape`` from the stdlib to neutralise HTML/script injection.
"""

import html


def sanitize_input(text: str, max_length: int = 2000) -> str:
    """Escape HTML entities, strip null bytes, and truncate."""
    if not text:
        return text
    text = text.replace("\x00", "")
    text = html.escape(text, quote=True)
    return text[:max_length]


def sanitize_message(text: str) -> str:
    return sanitize_input(text, max_length=4000)


def sanitize_username(text: str) -> str:
    return sanitize_input(text.strip(), max_length=32)


def sanitize_server_name(text: str) -> str:
    return sanitize_input(text.strip(), max_length=100)


def sanitize_channel_name(text: str) -> str:
    return sanitize_input(text.strip(), max_length=100)


def sanitize_bio(text: str) -> str:
    return sanitize_input(text.strip(), max_length=500)


def sanitize_document_title(text: str) -> str:
    return sanitize_input(text.strip(), max_length=200)
