from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import and_
from sqlalchemy.orm import foreign, remote
from typing import Optional, List
from datetime import datetime
import secrets

# Users
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    password: str
    icon_url: Optional[str]
    public_key: Optional[str] = Field(default=None)  # Base64-encoded X25519 public key
    created_at: datetime = Field(default_factory=datetime.utcnow)
    memberships: List["ServerMembership"] = Relationship(back_populates="user")


# Token blacklist for logout invalidation
class TokenBlacklist(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(index=True)
    blacklisted_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

# Messages
class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str
    server_id: int = Field(foreign_key="server.id")
    server: "Server" = Relationship(back_populates="messages")
    user_id: int
    is_encrypted: bool = Field(default=False)
    nonce: Optional[str] = Field(default=None)  # Base64-encoded nonce
    sender_public_key: Optional[str] = Field(default=None)  # Base64 sender public key
    created_at: datetime = Field(default_factory=datetime.utcnow)



# Server
class Server(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(foreign_key="user.id")
    icon_url: Optional[str] = None

    messages: List["Message"] = Relationship(
        back_populates="server", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    memberships: List["ServerMembership"] = Relationship(
        back_populates="server", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    roles: List["Role"] = Relationship(
        back_populates="server", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class ServerMembership(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    server_id: int = Field(foreign_key="server.id", primary_key=True)

    user: "User" = Relationship(back_populates="memberships")
    server: "Server" = Relationship(back_populates="memberships")

    roles: List["ServerMembershipRole"] = Relationship(
        back_populates="membership",
        sa_relationship_kwargs={
            "primaryjoin": lambda: and_(
                ServerMembership.user_id == foreign(ServerMembershipRole.user_id),
                ServerMembership.server_id == foreign(ServerMembershipRole.server_id),
            ),
            "foreign_keys": lambda: [ServerMembershipRole.user_id, ServerMembershipRole.server_id],
            "cascade": "all, delete-orphan",
        }
    )


class ServerMembershipRole(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    server_id: int = Field(foreign_key="server.id", primary_key=True)
    role_id: int = Field(foreign_key="role.id", primary_key=True)

    role: "Role" = Relationship(back_populates="memberships")

    membership: "ServerMembership" = Relationship(
        back_populates="roles",
        sa_relationship_kwargs={
            "primaryjoin": lambda: and_(
                foreign(ServerMembershipRole.user_id) == ServerMembership.user_id,
                foreign(ServerMembershipRole.server_id) == ServerMembership.server_id,
            ),
            "foreign_keys": lambda: [ServerMembershipRole.user_id, ServerMembershipRole.server_id],
            "uselist": False,
        }
    )


class ServerBan(SQLModel, table=True):
    server_id: int = Field(foreign_key="server.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    banned_by: int = Field(foreign_key="user.id")
    banned_at: datetime = Field(default_factory=datetime.utcnow)

class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    server_id: int = Field(foreign_key="server.id")
    name: str
    is_default: bool = Field(default=False)

    server: "Server" = Relationship(back_populates="roles", sa_relationship_kwargs={"lazy": "selectin"})
    permissions: List["RolePermission"] = Relationship(
        back_populates="role", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    memberships: List["ServerMembershipRole"] = Relationship(
        back_populates="role", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    @property
    def users(self):
        return [membership.user for membership in self.memberships]

class RolePermission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    role_id: int = Field(foreign_key="role.id")
    permission: str

    role: "Role" = Relationship(back_populates="permissions")

class ServerInvite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(default_factory=lambda: secrets.token_urlsafe(16), index=True, unique=True)
    server_id: int = Field(foreign_key="server.id")
    created_by: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    server: "Server" = Relationship()
    user: "User" = Relationship()


# ─── Friends & Direct Messages ────────────────────────────────────

class Friendship(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    friend_id: int = Field(foreign_key="user.id", index=True)
    status: str = Field(default="pending")  # "pending", "accepted", "rejected"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Conversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: Optional[str] = None  # Optional name for group DMs
    is_group: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    members: List["ConversationMember"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    messages: List["DirectMessage"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class ConversationMember(SQLModel, table=True):
    conversation_id: int = Field(foreign_key="conversation.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    conversation: "Conversation" = Relationship(back_populates="members")


class DirectMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    content: str
    is_encrypted: bool = Field(default=False)
    nonce: Optional[str] = Field(default=None)  # Base64-encoded nonce
    sender_public_key: Optional[str] = Field(default=None)  # Base64 sender public key
    created_at: datetime = Field(default_factory=datetime.utcnow)

    conversation: "Conversation" = Relationship(back_populates="messages")


# Server encryption keys (symmetric key encrypted per-member with their public key)
class ServerKey(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    server_id: int = Field(foreign_key="server.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    encrypted_key: str  # Base64: the server's symmetric key encrypted with this user's public key
    nonce: str  # Base64: nonce used for the encryption
    encrypted_by: Optional[int] = Field(default=None, foreign_key="user.id")  # Who encrypted this key
    created_at: datetime = Field(default_factory=datetime.utcnow)