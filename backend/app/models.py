from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import and_
from sqlalchemy.orm import foreign, remote
from typing import Optional, List
from datetime import datetime
import secrets

# Users
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    email: str
    password: str
    icon_url: Optional[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    memberships: List["ServerMembership"] = Relationship(back_populates="user")

# Messages
class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str
    server_id: int = Field(foreign_key="server.id")
    server: "Server" = Relationship(back_populates="messages")
    user_id: int
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

    server: "Server" = Relationship(back_populates="roles", sa_relationship_kwargs={"lazy": "selectin"})
    permissions: List["RolePermission"] = Relationship(back_populates="role")
    memberships: List["ServerMembershipRole"] = Relationship(back_populates="role")

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