import os
import re
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

# ── Secrets & Config ─────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-dev-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# ── Password Hashing (bcrypt) ───────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    #Hash a plaintext password using bcrypt.
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    #Verify a plaintext password against a bcrypt hash.
    return pwd_context.verify(plain_password, hashed_password)


# ── Password Strength Validation ─────────────────────────────────────
def validate_password_strength(password: str) -> tuple[bool, str]:
    #Validate password meets minimum security requirements.
    #Returns (is_valid, error_message).
    
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        return False, "Password must contain at least one special character."
    return True, ""


# ── JWT Token Creation ───────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    #Create a short-lived access token with type='access'.
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    #Create a long-lived refresh token with type='refresh'.
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    #Decode and validate a JWT token.
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
