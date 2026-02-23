from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from pydantic import validator


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserRead(BaseModel):
    id: int
    username: str
    email: str
    icon_url: Optional[str] = None
    created_at: datetime

class PublicUserRead(BaseModel):
    id: int
    username: str
    icon_url: Optional[str] = None
    created_at: Optional[datetime] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class MessageCreate(BaseModel):
    content: str
    server_id: int
    user_id: int
    created_at: Optional[datetime] = None  # or timestamp
    is_encrypted: bool = False
    nonce: Optional[str] = None
    sender_public_key: Optional[str] = None

class MessageUpdate(BaseModel):
    content: str
    is_encrypted: bool = False
    nonce: Optional[str] = None
    sender_public_key: Optional[str] = None

class RoleCreate(BaseModel):
    name: str
    permissions: List[str]

class RoleRead(BaseModel):
    id: int
    server_id: int
    name: str
    permissions: List[str]
    users: List[PublicUserRead] = []
    is_default: bool = False

    class Config:
        orm_mode = True

    @validator('permissions', pre=True, always=True)
    def extract_permissions(cls, v, values):
        # v will be the list of RolePermission ORM objects
        if isinstance(v, list) and v and hasattr(v[0], 'permission'):
            return [perm.permission for perm in v]
        return v

class RoleAssign(BaseModel):
    user_id: int
    role_id: int

class ServerInviteCreate(BaseModel):
    server_id: int

class ServerInviteRead(BaseModel):
    token: str
    server_id: int
    created_by: int
    created_at: datetime

class ServerRead(BaseModel):
    id: int
    name: str
    owner_id: int
    icon_url: Optional[str] = None  # Add this

    class Config:
        orm_mode = True


class ServerUpdate(BaseModel):
    name: str


# ─── Friends & Direct Messages ────────────────────────────────────

class FriendshipRead(BaseModel):
    id: int
    user_id: int
    friend_id: int
    status: str
    created_at: datetime
    friend: Optional[PublicUserRead] = None

    class Config:
        orm_mode = True

class FriendRequestCreate(BaseModel):
    friend_username: str

class ConversationRead(BaseModel):
    id: int
    name: Optional[str] = None
    is_group: bool
    created_at: datetime
    members: List[PublicUserRead] = []

    class Config:
        orm_mode = True

class DirectMessageCreate(BaseModel):
    content: str
    is_encrypted: bool = False
    nonce: Optional[str] = None
    sender_public_key: Optional[str] = None

class DirectMessageRead(BaseModel):
    id: int
    conversation_id: int
    user_id: int
    username: str
    content: str
    is_encrypted: bool = False
    nonce: Optional[str] = None
    sender_public_key: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True


# ─── Encryption ──────────────────────────────────────────────────

class PublicKeyUpload(BaseModel):
    public_key: str  # Base64-encoded X25519 public key

class PublicKeyRead(BaseModel):
    user_id: int
    username: str
    public_key: Optional[str] = None

class ServerKeyUpload(BaseModel):
    server_id: int
    encrypted_keys: List[dict]  # [{user_id, encrypted_key, nonce}, ...]

class ServerKeyRead(BaseModel):
    server_id: int
    encrypted_key: str
    nonce: str
    encrypted_by: Optional[int] = None  # User ID of who encrypted this key