from fastapi import APIRouter, HTTPException, status, Depends, Query, Request, Body, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import RedirectResponse
from typing import List
from sqlmodel import Session, select, delete
from app.schemas import (
    MessageCreate, MessageUpdate, UserCreate, RoleAssign, LoginRequest, Token,
    UserRead, PublicUserRead, RoleRead, RoleCreate, ServerInviteRead, ServerInviteCreate,
    ServerRead, ServerUpdate, UserUpdate,
    FriendshipRead, FriendRequestCreate, ConversationRead, DirectMessageCreate, DirectMessageRead,
)
from app.models import (
    User, Server, Message, ServerMembership, ServerInvite, ServerMembershipRole,
    Role, ServerBan, RolePermission, TokenBlacklist,
    Friendship, Conversation, ConversationMember, DirectMessage,
)
from app.database import get_session, engine
from app.auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    validate_password_strength, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.utils.permissions import is_server_owner, has_permission
from app.websocket_manager import manager
from datetime import timedelta, datetime
from jose import JWTError, jwt
from app.rate_limit import limiter
from sqlalchemy.orm import joinedload
import os
from uuid import uuid4

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "user_icons")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def is_token_blacklisted(token: str, session: Session) -> bool:
    """Check if a token has been blacklisted (e.g. via logout)."""
    entry = session.exec(select(TokenBlacklist).where(TokenBlacklist.token == token)).first()
    return entry is not None


def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Check if the token has been blacklisted (logged out)
    if is_token_blacklisted(token, session):
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Ensure this is an access token, not a refresh token
        token_type = payload.get("type", "access")
        if token_type != "access":
            raise credentials_exception

        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # sub is now the user ID as a string
    try:
        user_id = int(sub)
    except (ValueError, TypeError):
        raise credentials_exception

    user = session.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user

def require_server_owner(user: User, server_id: int, session: Session):
    server = session.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != user.id:
        raise HTTPException(403, "Only server owner can perform this action")
    return server

def is_banned_from_server(user_id: int, server_id: int, session: Session) -> bool:
    ban = session.exec(
        select(ServerBan).where(
            (ServerBan.server_id == server_id) & (ServerBan.user_id == user_id)
        )
    ).first()
    return ban is not None


# Messages
@limiter.limit("30/minute")
@router.post("/messages")
async def send_message(
    request: Request,
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # 🔒 Check if the user is a member of the server
    membership = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == message.server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()

    if is_banned_from_server(current_user.id, message.server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    # ✅ Proceed to create the message
    db_message = Message(
        content=message.content,
        user_id=current_user.id,  # use authenticated user
        server_id=message.server_id,
        created_at=message.created_at or datetime.utcnow()
    )
    session.add(db_message)
    session.commit()
    session.refresh(db_message)

    # Broadcast new message to all WebSocket clients in this server
    await manager.broadcast_to_server(message.server_id, {
        "type": "new_message",
        "message": {
            "id": db_message.id,
            "content": db_message.content,
            "user_id": db_message.user_id,
            "username": current_user.username,
            "server_id": db_message.server_id,
            "timestamp": db_message.created_at.isoformat(),
        }
    })

    return {"detail": "Message sent", "message_id": db_message.id}

@router.put("/messages/{message_id}")
async def edit_message(
    message_id: int,
    message: MessageUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    print("edit___", session)
    db_message = session.get(Message, message_id)
    if not db_message:
        raise HTTPException(status_code=404, detail="Message not found")

    if is_banned_from_server(current_user.id, db_message.server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    if db_message.user_id != current_user.id:
        # # check if user has permission to edit messages in this server
        # if not (is_server_owner(current_user, db_message.server_id, session) or
        #         has_permission(current_user, db_message.server_id, "edit_message", session)):
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    db_message.content = message.content
    session.add(db_message)
    session.commit()
    session.refresh(db_message)

    # Broadcast edit to all WebSocket clients in this server
    await manager.broadcast_to_server(db_message.server_id, {
        "type": "message_edited",
        "message_id": db_message.id,
        "content": db_message.content,
    })

    return {"detail": "Message edited"}

@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    server_id: int = Query(...),  # require server_id as query parameter
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    db_message = session.get(Message, message_id)
    if not db_message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Use the passed server_id here
    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    if db_message.user_id != current_user.id:
        if not (is_server_owner(current_user, server_id, session) or
                has_permission(current_user, server_id, "DELETE_MESSAGES", session)):
            raise HTTPException(status_code=403, detail="You can only delete your own messages")

    msg_server_id = db_message.server_id
    msg_id = db_message.id
    session.delete(db_message)
    session.commit()

    # Broadcast deletion to all WebSocket clients in this server
    await manager.broadcast_to_server(msg_server_id, {
        "type": "message_deleted",
        "message_id": msg_id,
    })

    return {"detail": "Message deleted"}


@router.get("/messages", response_model=List[dict])  # temporary structure
async def load_messages(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # 🔒 Check if user is a member of the server
    membership = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # ✅ User is authorized to view messages
    messages = session.exec(
        select(Message, User)
        .join(User, User.id == Message.user_id)
        .where(Message.server_id == server_id)
    ).all()

    results = [
        {
            "id": msg.id,
            "content": msg.content,
            "user_id": msg.user_id,
            "username": user.username,
            "server_id": msg.server_id,
            "timestamp": msg.created_at.isoformat(),
        }
        for msg, user in messages
    ]
    return results

# Users
@router.post("/users")
async def create_user(user: UserCreate):
    # logic to create user
    return {"detail": "User created"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own account")

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    session.delete(db_user)
    session.commit()
    return {"detail": "User deleted"}

@router.get("/roles/permissions", response_model=List[str])
def get_available_permissions():
    return [
        "VIEW_CHANNEL",
        "SEND_MESSAGES",
        "MANAGE_ROLES",
        "KICK_MEMBERS",
        "BAN_MEMBERS",
        "DELETE_MESSAGES",
        # Add more as needed
    ]

# Roles
@router.post("/servers/{server_id}/roles", response_model=RoleRead)
def create_role(
    server_id: int,
    role: RoleCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):

    membership = session.exec(
        select(ServerMembership)
        .where(
            (ServerMembership.user_id == current_user.id) &
            (ServerMembership.server_id == server_id)
        )
    ).first()

    require_server_owner(current_user, server_id, session)
    
    db_role = Role(server_id=server_id, name=role.name)
    session.add(db_role)
    session.commit()
    session.refresh(db_role)

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")
    
    if not membership:
        raise HTTPException(status_code=403, detail="You must be a member of this server to view roles")

    # Add permissions
    for perm in role.permissions:
        rp = RolePermission(role_id=db_role.id, permission=perm)
        session.add(rp)
    session.commit()

    session.refresh(db_role)
    return db_role

@router.put("/servers/{server_id}/roles/{role_id}", response_model=RoleRead)
def update_role(
    server_id: int,
    role_id: int,
    updated_data: RoleCreate = Body(...),  # Reuse your RoleCreate schema
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    require_server_owner(current_user, server_id, session)

    role = session.exec(
        select(Role).where(Role.id == role_id, Role.server_id == server_id)
    ).first()

    if not role:
        raise HTTPException(404, "Role not found")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    role.name = updated_data.name
    session.commit()

    # Update permissions
    session.exec(
        delete(RolePermission).where(RolePermission.role_id == role_id)
    )
    for perm in updated_data.permissions:
        session.add(RolePermission(role_id=role_id, permission=perm))
    session.commit()
    session.refresh(role)

    return role

@router.get("/servers/{server_id}/roles", response_model=List[RoleRead])
def get_roles(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    membership = session.exec(
        select(ServerMembership)
        .where(
            (ServerMembership.user_id == current_user.id) &
            (ServerMembership.server_id == server_id)
        )
    ).first()

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    if not membership:
        raise HTTPException(status_code=403, detail="You must be a member of this server to view roles")

    roles = session.exec(
        select(Role)
        .where(Role.server_id == server_id)
        .options(joinedload(Role.memberships).joinedload(ServerMembershipRole.membership).joinedload(ServerMembership.user))
    ).unique().all()  # <- FIX HERE

    roles_with_users = []
    for role in roles:
        users = []
        for membership_role in role.memberships:
            if membership_role.membership and membership_role.membership.user:
                user = membership_role.membership.user
                users.append({"id": user.id, "username": user.username})
        role_dict = role.dict()
        role_dict['permissions'] = [perm.permission for perm in role.permissions]
        role_dict['users'] = users
        roles_with_users.append(role_dict)

    return roles_with_users


@router.post("/servers/{server_id}/roles/assign")
def assign_role_to_user(
    server_id: int,
    role_assign: RoleAssign,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    require_server_owner(current_user, server_id, session)

    # Validate role belongs to server
    role = session.exec(select(Role).where(Role.id == role_assign.role_id, Role.server_id == server_id)).first()
    if not role:
        raise HTTPException(404, "Role not found in server")

    # Validate user membership
    membership = session.exec(
        select(ServerMembership)
        .where(
            (ServerMembership.user_id == role_assign.user_id) &
            (ServerMembership.server_id == server_id)
        )
    ).first()
    if not membership:
        raise HTTPException(404, "User is not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # Assign role
    existing = session.exec(
        select(ServerMembershipRole).where(
            (ServerMembershipRole.user_id == role_assign.user_id) &
            (ServerMembershipRole.server_id == server_id) &
            (ServerMembershipRole.role_id == role_assign.role_id)
        )
    ).first()
    if existing:
        return {"detail": "Role already assigned"}

    smr = ServerMembershipRole(user_id=role_assign.user_id, server_id=server_id, role_id=role_assign.role_id)
    session.add(smr)
    session.commit()
    return {"detail": "Role assigned"}

@router.post("/servers/{server_id}/roles/unassign")
def unassign_role_from_user(
    server_id: int,
    role_assign: RoleAssign,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    require_server_owner(current_user, server_id, session)

    smr = session.exec(
        select(ServerMembershipRole).where(
            (ServerMembershipRole.user_id == role_assign.user_id) &
            (ServerMembershipRole.server_id == server_id) &
            (ServerMembershipRole.role_id == role_assign.role_id)
        )
    ).first()

    if not smr:
        raise HTTPException(404, "Role assignment not found")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    session.delete(smr)
    session.commit()
    return {"detail": "Role unassigned"}
    
@router.delete("/servers/{server_id}/roles/{role_id}")
def delete_role(
    server_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    require_server_owner(current_user, server_id, session)

    role = session.exec(select(Role).where(Role.id == role_id, Role.server_id == server_id)).first()
    if not role:
        raise HTTPException(404, "Role not found")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # Delete role permissions
    perms = session.exec(select(RolePermission).where(RolePermission.role_id == role_id)).all()
    for perm in perms:
        session.delete(perm)

    # Delete role assignments
    assignments = session.exec(select(ServerMembershipRole).where(ServerMembershipRole.role_id == role_id)).all()
    for assign in assignments:
        session.delete(assign)

    session.delete(role)
    session.commit()
    return {"detail": "Role deleted"}

@router.get("/servers/{server_id}/users/{user_id}/roles", response_model=List[RoleRead])
def get_user_roles(
    server_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Ensure current_user is a member of the server
    current_user_membership = session.exec(
        select(ServerMembership).where(
            (ServerMembership.user_id == current_user.id) &
            (ServerMembership.server_id == server_id)
        )
    ).first()

    if not current_user_membership:
        raise HTTPException(status_code=403, detail="You must be a member of the server to view roles")

    # Ensure target user is also a member
    target_user_membership = session.exec(
        select(ServerMembership).where(
            (ServerMembership.user_id == user_id) &
            (ServerMembership.server_id == server_id)
        )
    ).first()

    if not target_user_membership:
        raise HTTPException(status_code=404, detail="User is not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # Fetch roles assigned to the user
    role_ids = session.exec(
        select(ServerMembershipRole.role_id).where(
            (ServerMembershipRole.user_id == user_id) &
            (ServerMembershipRole.server_id == server_id)
        )
    ).all()

    if not role_ids:
        return []

    roles = session.exec(select(Role).where(Role.id.in_(role_ids))).all()
    return roles

# Servers
@router.post("/servers", response_model=Server)
def create_server(
    server: Server,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    db_server = Server(name=server.name, owner_id=current_user.id)
    session.add(db_server)
    session.commit()
    session.refresh(db_server)

    # Automatically add creator to ServerMembership
    membership = ServerMembership(user_id=current_user.id, server_id=db_server.id)
    session.add(membership)
    session.commit()

    return db_server

@router.put("/servers/{server_id}")
async def rename_server(
    server_id: int,
    data: ServerUpdate = Body(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    server = require_server_owner(current_user, server_id, session)

    if not data.name.strip():
        raise HTTPException(400, "Server name cannot be empty")

    server.name = data.name.strip()
    session.add(server)
    session.commit()
    session.refresh(server)
    return {"detail": "Server renamed successfully", "name": server.name}


@router.delete("/servers/{server_id}")
async def delete_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    server = require_server_owner(current_user, server_id, session)

    session.delete(server)
    session.commit()
    return server

@router.get("/servers")
def list_servers(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Subquery to find banned server IDs for the current user
    banned_server_ids = session.exec(
        select(ServerBan.server_id).where(ServerBan.user_id == current_user.id)
    ).all()
    banned_server_ids = [sid for (sid,) in banned_server_ids]  # unpack from tuples if needed

    # Main query to get only servers the user is a member of and not banned from
    servers = session.exec(
        select(Server)
        .join(ServerMembership, Server.id == ServerMembership.server_id)
        .where(
            (ServerMembership.user_id == current_user.id) &
            (Server.id.not_in(banned_server_ids))
        )
    ).all()

    return servers

@router.get("/servers/{server_id}")
def get_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    server = session.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server

@router.get("/servers/{server_id}/users", response_model=List[PublicUserRead])
def get_users_in_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    server = session.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Ensure requesting user is a member and not banned
    membership = session.exec(
        select(ServerMembership).where(
            (ServerMembership.server_id == server_id) &
            (ServerMembership.user_id == current_user.id)
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # ✅ Get list of banned user IDs
    banned_user_ids = session.exec(
        select(ServerBan.user_id).where(ServerBan.server_id == server_id)
    ).all()

    # ✅ Get memberships of non-banned users
    memberships = session.exec(
        select(ServerMembership).where(ServerMembership.server_id == server_id)
    ).all()

    non_banned_user_ids = [m.user_id for m in memberships if m.user_id not in banned_user_ids]

    users = session.exec(select(User).where(User.id.in_(non_banned_user_ids))).all()
    return users

# Endpoint to generate invite link
@router.post("/servers/{server_id}/generate-invite", response_model=ServerInviteRead)
async def generate_invite_link(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Check membership
    membership = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    invite = ServerInvite(server_id=server_id, created_by=current_user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    return invite

# List all invite links for a server
@router.get("/servers/{server_id}/invites", response_model=List[ServerInviteRead])
async def get_server_invites(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Check membership
    membership = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    invites = session.exec(
        select(ServerInvite).where(ServerInvite.server_id == server_id)
    ).all()
    return invites


@router.delete("/invites/{invite_token}", status_code=200)
async def delete_invite(
    invite_token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    invite = session.exec(select(ServerInvite).where(ServerInvite.token == invite_token)).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    server = session.get(Server, invite.server_id)

    # Fix this permission check:
    if current_user.id != invite.created_by and current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this invite")

    session.delete(invite)
    session.commit()

    return {"detail": "Invite deleted successfully"}



# Endpoint to join server via token
@router.post("/invite/{invite_token}")
async def join_server_with_invite(
    invite_token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.exec(
        select(ServerInvite).where(ServerInvite.token == invite_token)
    ).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite")

    if is_banned_from_server(current_user.id, invite.server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # Check if already a member
    existing = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == invite.server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()

    if not existing:
        new_membership = ServerMembership(
            server_id=invite.server_id,
            user_id=current_user.id
        )
        session.add(new_membership)
        session.commit()

    # Redirect to frontend chat page
    return {
        "detail": "Successfully joined the server.",
        "server_id": invite.server_id
    }

@router.post("/servers/{server_id}/kick")
async def kick_from_server(
    server_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    print("kick___", session)
    # Check if user to be kicked is a member
    membership = session.exec(
        select(ServerMembership).where(
            (ServerMembership.server_id == server_id) &
            (ServerMembership.user_id == user_id)
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=404, detail="User is not a member of the server")

    # Permission check: must be server owner or have 'kick' permission
    if not (is_server_owner(current_user, server_id, session) or
            has_permission(current_user, server_id, "kick", session)):
        raise HTTPException(status_code=403, detail="You do not have permission to kick users")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    session.delete(membership)

    # Optionally delete roles as well
    roles = session.exec(
        select(ServerMembershipRole).where(
            (ServerMembershipRole.server_id == server_id) &
            (ServerMembershipRole.user_id == user_id)
        )
    ).all()
    for role in roles:
        session.delete(role)

    session.commit()
    return {"detail": "User kicked from server"}


@router.post("/servers/{server_id}/ban")
async def ban_from_server(
    server_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Check membership
    membership = session.exec(
        select(ServerMembership).where(
            (ServerMembership.server_id == server_id) &
            (ServerMembership.user_id == user_id)
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=404, detail="User is not a member of the server")

    # Permission check
    if not (is_server_owner(current_user, server_id, session) or
            has_permission(current_user, server_id, "ban", session)):
        raise HTTPException(status_code=403, detail="You do not have permission to ban users")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    # Delete membership and roles
    session.delete(membership)

    roles = session.exec(
        select(ServerMembershipRole).where(
            (ServerMembershipRole.server_id == server_id) &
            (ServerMembershipRole.user_id == user_id)
        )
    ).all()
    for role in roles:
        session.delete(role)

    # Add to banned list
    ban_entry = ServerBan(server_id=server_id, user_id=user_id, banned_by=current_user.id)
    session.add(ban_entry)

    session.commit()
    return {"detail": "User banned from server"}

@router.post("/servers/{server_id}/unban")
async def unban_user(
    server_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if not (is_server_owner(current_user, server_id, session) or has_permission(current_user, server_id, "ban", session)):
        raise HTTPException(status_code=403, detail="You do not have permission to unban users")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    ban = session.exec(
        select(ServerBan).where(
            (ServerBan.server_id == server_id) &
            (ServerBan.user_id == user_id)
        )
    ).first()

    if not ban:
        raise HTTPException(status_code=404, detail="User is not banned")

    session.delete(ban)
    session.commit()
    return {"detail": "User unbanned"}

@router.get("/servers/{server_id}/banned-users")
async def get_banned_users(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if not (is_server_owner(current_user, server_id, session) or has_permission(current_user, server_id, "ban", session)):
        raise HTTPException(status_code=403, detail="You do not have permission to view banned users")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    bans = session.exec(
        select(ServerBan).where(ServerBan.server_id == server_id)
    ).all()

    user_ids = [ban.user_id for ban in bans]

    users = session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()

    return users


@router.post("/servers/{server_id}/leave")
async def leave_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Check if the server exists
    server = session.get(Server, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Prevent the server owner from leaving their own server
    if server.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Server owner cannot leave their own server")

    # Check if the user is a member of the server
    membership = session.exec(
        select(ServerMembership)
        .where(
            (ServerMembership.server_id == server_id) &
            (ServerMembership.user_id == current_user.id)
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    # Remove the user from the server membership
    session.delete(membership)

    # Optionally: also remove any role assignments for this user in the server
    roles = session.exec(
        select(ServerMembershipRole).where(
            (ServerMembershipRole.server_id == server_id) &
            (ServerMembershipRole.user_id == current_user.id)
        )
    ).all()
    for role in roles:
        session.delete(role)

    session.commit()
    return {"detail": "You have left the server"}

# ─── Friends ──────────────────────────────────────────────────────

@router.post("/friends/request")
async def send_friend_request(
    body: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Send a friend request by username."""
    friend = session.exec(select(User).where(User.username == body.friend_username)).first()
    if not friend:
        raise HTTPException(status_code=404, detail="User not found")
    if friend.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a friend")

    # Check if a friendship already exists in either direction
    existing = session.exec(
        select(Friendship).where(
            ((Friendship.user_id == current_user.id) & (Friendship.friend_id == friend.id)) |
            ((Friendship.user_id == friend.id) & (Friendship.friend_id == current_user.id))
        )
    ).first()

    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        if existing.status == "pending":
            # If the other person already sent us a request, auto-accept
            if existing.user_id == friend.id:
                existing.status = "accepted"
                session.add(existing)
                session.commit()
                return {"detail": "Friend request accepted (they already sent you one)"}
            raise HTTPException(status_code=400, detail="Friend request already sent")
        if existing.status == "rejected":
            # Allow re-sending after rejection
            existing.status = "pending"
            existing.user_id = current_user.id
            existing.friend_id = friend.id
            existing.created_at = datetime.utcnow()
            session.add(existing)
            session.commit()
            return {"detail": "Friend request sent"}

    friendship = Friendship(user_id=current_user.id, friend_id=friend.id, status="pending")
    session.add(friendship)
    session.commit()

    # Notify the target user via WebSocket if they're connected to any DM channel
    await manager.send_to_user(friend.id, {
        "type": "friend_request",
        "from_user": {"id": current_user.id, "username": current_user.username, "icon_url": current_user.icon_url},
    })

    return {"detail": "Friend request sent"}


@router.post("/friends/{friendship_id}/accept")
async def accept_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Accept an incoming friend request."""
    friendship = session.get(Friendship, friendship_id)
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your friend request to accept")
    if friendship.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    friendship.status = "accepted"
    session.add(friendship)
    session.commit()

    # Notify the requester
    await manager.send_to_user(friendship.user_id, {
        "type": "friend_accepted",
        "friend": {"id": current_user.id, "username": current_user.username, "icon_url": current_user.icon_url},
    })

    return {"detail": "Friend request accepted"}


@router.post("/friends/{friendship_id}/reject")
async def reject_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Reject an incoming friend request."""
    friendship = session.get(Friendship, friendship_id)
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your friend request to reject")
    if friendship.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    friendship.status = "rejected"
    session.add(friendship)
    session.commit()
    return {"detail": "Friend request rejected"}


@router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Remove an accepted friend."""
    friendship = session.exec(
        select(Friendship).where(
            (
                ((Friendship.user_id == current_user.id) & (Friendship.friend_id == friend_id)) |
                ((Friendship.user_id == friend_id) & (Friendship.friend_id == current_user.id))
            ) &
            (Friendship.status == "accepted")
        )
    ).first()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    session.delete(friendship)
    session.commit()
    return {"detail": "Friend removed"}


@router.get("/friends", response_model=List[FriendshipRead])
async def list_friends(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """List all accepted friends."""
    friendships = session.exec(
        select(Friendship).where(
            (
                (Friendship.user_id == current_user.id) |
                (Friendship.friend_id == current_user.id)
            ) &
            (Friendship.status == "accepted")
        )
    ).all()

    result = []
    for f in friendships:
        other_id = f.friend_id if f.user_id == current_user.id else f.user_id
        other_user = session.get(User, other_id)
        result.append(FriendshipRead(
            id=f.id,
            user_id=f.user_id,
            friend_id=f.friend_id,
            status=f.status,
            created_at=f.created_at,
            friend=PublicUserRead(
                id=other_user.id,
                username=other_user.username,
                icon_url=other_user.icon_url,
                created_at=other_user.created_at,
            ) if other_user else None,
        ))
    return result


@router.get("/friends/requests", response_model=List[FriendshipRead])
async def list_friend_requests(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """List incoming pending friend requests."""
    friendships = session.exec(
        select(Friendship).where(
            (Friendship.friend_id == current_user.id) &
            (Friendship.status == "pending")
        )
    ).all()

    result = []
    for f in friendships:
        sender = session.get(User, f.user_id)
        result.append(FriendshipRead(
            id=f.id,
            user_id=f.user_id,
            friend_id=f.friend_id,
            status=f.status,
            created_at=f.created_at,
            friend=PublicUserRead(
                id=sender.id,
                username=sender.username,
                icon_url=sender.icon_url,
                created_at=sender.created_at,
            ) if sender else None,
        ))
    return result


@router.get("/friends/pending", response_model=List[FriendshipRead])
async def list_outgoing_requests(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """List outgoing pending friend requests."""
    friendships = session.exec(
        select(Friendship).where(
            (Friendship.user_id == current_user.id) &
            (Friendship.status == "pending")
        )
    ).all()

    result = []
    for f in friendships:
        target = session.get(User, f.friend_id)
        result.append(FriendshipRead(
            id=f.id,
            user_id=f.user_id,
            friend_id=f.friend_id,
            status=f.status,
            created_at=f.created_at,
            friend=PublicUserRead(
                id=target.id,
                username=target.username,
                icon_url=target.icon_url,
                created_at=target.created_at,
            ) if target else None,
        ))
    return result


# ─── Direct Messages / Conversations ─────────────────────────────

@router.post("/conversations", response_model=ConversationRead)
async def create_or_get_conversation(
    friend_id: int = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create or get a 1-on-1 conversation with a friend."""
    # Verify friendship
    friendship = session.exec(
        select(Friendship).where(
            (
                ((Friendship.user_id == current_user.id) & (Friendship.friend_id == friend_id)) |
                ((Friendship.user_id == friend_id) & (Friendship.friend_id == current_user.id))
            ) &
            (Friendship.status == "accepted")
        )
    ).first()
    if not friendship:
        raise HTTPException(status_code=403, detail="Must be friends to start a conversation")

    # Check if a 1-on-1 conversation already exists between these two users
    my_convos = session.exec(
        select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == current_user.id
        )
    ).all()
    their_convos = session.exec(
        select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == friend_id
        )
    ).all()

    common_ids = set(my_convos) & set(their_convos)
    for cid in common_ids:
        convo = session.get(Conversation, cid)
        if convo and not convo.is_group:
            # Found existing 1-on-1 conversation
            members = session.exec(
                select(ConversationMember).where(ConversationMember.conversation_id == convo.id)
            ).all()
            member_users = []
            for m in members:
                u = session.get(User, m.user_id)
                if u:
                    member_users.append(PublicUserRead(
                        id=u.id, username=u.username, icon_url=u.icon_url, created_at=u.created_at
                    ))
            return ConversationRead(
                id=convo.id, name=convo.name, is_group=convo.is_group,
                created_at=convo.created_at, members=member_users
            )

    # Create new conversation
    convo = Conversation(is_group=False)
    session.add(convo)
    session.flush()

    session.add(ConversationMember(conversation_id=convo.id, user_id=current_user.id))
    session.add(ConversationMember(conversation_id=convo.id, user_id=friend_id))
    session.commit()
    session.refresh(convo)

    friend_user = session.get(User, friend_id)
    member_users = [
        PublicUserRead(id=current_user.id, username=current_user.username, icon_url=current_user.icon_url, created_at=current_user.created_at),
        PublicUserRead(id=friend_user.id, username=friend_user.username, icon_url=friend_user.icon_url, created_at=friend_user.created_at) if friend_user else None,
    ]
    member_users = [m for m in member_users if m is not None]

    return ConversationRead(
        id=convo.id, name=convo.name, is_group=convo.is_group,
        created_at=convo.created_at, members=member_users
    )


@router.get("/conversations", response_model=List[ConversationRead])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """List all conversations for the current user."""
    my_member_rows = session.exec(
        select(ConversationMember).where(ConversationMember.user_id == current_user.id)
    ).all()

    result = []
    for row in my_member_rows:
        convo = session.get(Conversation, row.conversation_id)
        if not convo:
            continue
        members = session.exec(
            select(ConversationMember).where(ConversationMember.conversation_id == convo.id)
        ).all()
        member_users = []
        for m in members:
            u = session.get(User, m.user_id)
            if u:
                member_users.append(PublicUserRead(
                    id=u.id, username=u.username, icon_url=u.icon_url, created_at=u.created_at
                ))
        result.append(ConversationRead(
            id=convo.id, name=convo.name, is_group=convo.is_group,
            created_at=convo.created_at, members=member_users
        ))
    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[DirectMessageRead])
async def get_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get messages in a conversation."""
    # Verify membership
    membership = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    messages = session.exec(
        select(DirectMessage).where(
            DirectMessage.conversation_id == conversation_id
        ).order_by(DirectMessage.created_at)
    ).all()

    result = []
    for msg in messages:
        user = session.get(User, msg.user_id)
        result.append(DirectMessageRead(
            id=msg.id,
            conversation_id=msg.conversation_id,
            user_id=msg.user_id,
            username=user.username if user else "Unknown",
            content=msg.content,
            created_at=msg.created_at,
        ))
    return result


@router.post("/conversations/{conversation_id}/messages", response_model=DirectMessageRead)
async def send_dm(
    conversation_id: int,
    body: DirectMessageCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Send a message in a conversation."""
    # Verify membership
    membership = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    dm = DirectMessage(
        conversation_id=conversation_id,
        user_id=current_user.id,
        content=body.content,
    )
    session.add(dm)
    session.commit()
    session.refresh(dm)

    msg_data = DirectMessageRead(
        id=dm.id,
        conversation_id=dm.conversation_id,
        user_id=dm.user_id,
        username=current_user.username,
        content=dm.content,
        created_at=dm.created_at,
    )

    # Broadcast to all members via WebSocket
    members = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id
        )
    ).all()
    for m in members:
        if m.user_id != current_user.id:
            await manager.send_to_user(m.user_id, {
                "type": "dm_new_message",
                "conversation_id": conversation_id,
                "message": {
                    "id": dm.id,
                    "conversation_id": dm.conversation_id,
                    "user_id": dm.user_id,
                    "username": current_user.username,
                    "content": dm.content,
                    "created_at": dm.created_at.isoformat(),
                },
            })

    return msg_data


@router.put("/conversations/{conversation_id}/messages/{message_id}")
async def edit_dm(
    conversation_id: int,
    message_id: int,
    body: MessageUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Edit a DM message."""
    msg = session.get(DirectMessage, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")

    msg.content = body.content
    session.add(msg)
    session.commit()

    # Broadcast edit to conversation members
    members = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id
        )
    ).all()
    for m in members:
        if m.user_id != current_user.id:
            await manager.send_to_user(m.user_id, {
                "type": "dm_message_edited",
                "conversation_id": conversation_id,
                "message_id": message_id,
                "content": body.content,
            })

    return {"detail": "Message updated"}


@router.delete("/conversations/{conversation_id}/messages/{message_id}")
async def delete_dm(
    conversation_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a DM message."""
    msg = session.get(DirectMessage, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")

    session.delete(msg)
    session.commit()

    # Broadcast deletion to conversation members
    members = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id
        )
    ).all()
    for m in members:
        if m.user_id != current_user.id:
            await manager.send_to_user(m.user_id, {
                "type": "dm_message_deleted",
                "conversation_id": conversation_id,
                "message_id": message_id,
            })

    return {"detail": "Message deleted"}


@router.get("/conversations/{conversation_id}/messages/sync")
async def sync_dm_messages(
    conversation_id: int,
    after_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get DM messages after a given ID for reconnection sync."""
    membership = session.exec(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    messages = session.exec(
        select(DirectMessage).where(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.id > after_id
        ).order_by(DirectMessage.created_at)
    ).all()

    result = []
    for msg in messages:
        user = session.get(User, msg.user_id)
        result.append({
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "user_id": msg.user_id,
            "username": user.username if user else "Unknown",
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
        })
    return result

@router.post("/auth/register", status_code=201)
def register(user: UserCreate, session: Session = Depends(get_session)):
    # Validate username format
    username = user.username.strip()
    if len(username) < 3 or len(username) > 32:
        raise HTTPException(status_code=400, detail="Username must be between 3 and 32 characters.")
    if not username.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, hyphens, and underscores.")

    # Validate email format
    email = user.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    # Validate password strength
    is_valid, error_msg = validate_password_strength(user.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # Check for duplicate username
    existing_username = session.exec(select(User).where(User.username == username)).first()
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already registered.")

    # Check for duplicate email
    existing_email = session.exec(select(User).where(User.email == email)).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="Email already registered.")

    # Hash the password with bcrypt and create user
    hashed_password = hash_password(user.password)
    user_obj = User(username=username, email=email, password=hashed_password)
    session.add(user_obj)
    session.commit()
    session.refresh(user_obj)

    return {
        "detail": "Account created successfully.",
        "user": {
            "id": user_obj.id,
            "username": user_obj.username,
            "email": user_obj.email,
        }
    }


@router.post("/auth/login")
def login(user: LoginRequest, session: Session = Depends(get_session)):
    # Allow login by username or email
    login_identifier = user.username.strip()
    db_user = session.exec(select(User).where(User.username == login_identifier)).first()
    if not db_user:
        # Try email lookup
        db_user = session.exec(select(User).where(User.email == login_identifier.lower())).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Create tokens with user ID as sub (must be string for jose)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(db_user.id)},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": str(db_user.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "userId": db_user.id,
        "username": db_user.username,
    }

@router.post("/auth/logout")
def logout(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    """Blacklist the current access token so it can no longer be used."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp = datetime.utcfromtimestamp(payload.get("exp", 0))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Add token to blacklist
    blacklist_entry = TokenBlacklist(token=token, expires_at=exp)
    session.add(blacklist_entry)
    session.commit()
    return {"detail": "Successfully logged out"}


@router.post("/auth/refresh")
def refresh_token(body: dict = Body(...), session: Session = Depends(get_session)):
    """Exchange a valid refresh token for a new access token."""
    refresh = body.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=400, detail="Refresh token is required")

    # Check if refresh token has been blacklisted
    if is_token_blacklisted(refresh, session):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    try:
        payload = jwt.decode(refresh, SECRET_KEY, algorithms=[ALGORITHM])

        # Verify this is actually a refresh token
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    try:
        user_id = int(sub)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue a new access token
    new_access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }


@router.get("/users/me", response_model=UserRead)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/users/me")
def update_user_info(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    updated = False
    print("Update payload:", data.dict())

    # Check if any change is being made
    making_sensitive_change = (
        (data.username and data.username != current_user.username) or
        (data.email and data.email != current_user.email) or
        data.new_password
    )

    if making_sensitive_change:
        if not data.current_password:
            raise HTTPException(400, detail="Current password is required for any account changes.")
        if not verify_password(data.current_password, current_user.password):
            raise HTTPException(403, detail="Incorrect current password")

    if data.username and data.username != current_user.username:
        existing = session.exec(select(User).where(User.username == data.username)).first()
        if existing:
            raise HTTPException(400, detail="Username already taken")
        current_user.username = data.username
        updated = True

    if data.email and data.email != current_user.email:
        existing = session.exec(select(User).where(User.email == data.email)).first()
        if existing:
            raise HTTPException(400, detail="Email already taken")
        current_user.email = data.email
        updated = True

    if data.new_password:
        is_valid, error_msg = validate_password_strength(data.new_password)
        if not is_valid:
            raise HTTPException(400, detail=error_msg)
        current_user.password = hash_password(data.new_password)
        updated = True

    if not updated:
        raise HTTPException(400, detail="No valid fields provided for update")

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return {
        "detail": "User updated",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
        }
    }

@router.put("/users/me/icon")
async def upload_user_icon(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")

    # Generate a unique filename
    ext = os.path.splitext(file.filename)[-1]
    filename = f"{uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save new file to disk
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Remove previous icon file if exists
    if current_user.icon_url:
        # Build full path to old icon file (icon_url is like "/static/user_icons/filename.ext")
        old_icon_path = os.path.join(UPLOAD_DIR, os.path.basename(current_user.icon_url))
        if os.path.isfile(old_icon_path):
            try:
                os.remove(old_icon_path)
            except Exception as e:
                # Log error if needed but don't block upload
                print(f"Error deleting old icon file: {e}")

    # Update DB with new icon URL (relative to static dir)
    public_path = f"/static/user_icons/{filename}"
    current_user.icon_url = public_path
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return {
        "detail": "Icon uploaded successfully",
        "icon_url": public_path
    }

@router.put("/servers/{server_id}/icon")
async def upload_server_icon(
    server_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    server = session.get(Server, server_id)

    if not server or server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to update this server's icon.")

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type.")

    ext = os.path.splitext(file.filename)[-1]
    filename = f"{uuid4().hex}{ext}"
    file_path = os.path.join("static/server_icons", filename)

    # Save file
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Delete old icon if exists
    if hasattr(server, "icon_url") and server.icon_url:
        try:
            old_icon_path = os.path.join("static/server_icons", os.path.basename(server.icon_url))
            if os.path.isfile(old_icon_path):
                os.remove(old_icon_path)
        except Exception as e:
            print(f"Error deleting old icon: {e}")

    # Save new path
    server.icon_url = f"/static/server_icons/{filename}"
    session.add(server)
    session.commit()
    session.refresh(server)

    return {
        "detail": "Server icon uploaded successfully",
        "icon_url": server.icon_url
    }




# Missed messages sync endpoint
@router.get("/messages/sync")
async def sync_messages(
    server_id: int,
    after_id: int = Query(..., description="Last message ID the client has"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Return messages in a server that were sent after the given message ID."""
    membership = session.exec(
        select(ServerMembership).where(
            ServerMembership.server_id == server_id,
            ServerMembership.user_id == current_user.id
        )
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this server")

    if is_banned_from_server(current_user.id, server_id, session):
        raise HTTPException(status_code=403, detail="You are banned from this server")

    messages = session.exec(
        select(Message, User)
        .join(User, User.id == Message.user_id)
        .where(Message.server_id == server_id, Message.id > after_id)
        .order_by(Message.id)
    ).all()

    results = [
        {
            "id": msg.id,
            "content": msg.content,
            "user_id": msg.user_id,
            "username": user.username,
            "server_id": msg.server_id,
            "timestamp": msg.created_at.isoformat(),
        }
        for msg, user in messages
    ]
    return results


def authenticate_ws_token(token: str, session: Session):
    """Validate a JWT token for WebSocket connections. Returns the User or None."""
    if is_token_blacklisted(token, session):
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type", "access") != "access":
            return None
        sub = payload.get("sub")
        if sub is None:
            return None
        user_id = int(sub)
    except (JWTError, ValueError, TypeError):
        return None
    return session.get(User, user_id)


@router.websocket("/ws/{server_id}")
async def websocket_endpoint(websocket: WebSocket, server_id: int):
    """
    WebSocket endpoint for real-time messaging per server.

    Client sends JSON messages with a "type" field:
      - {"type": "auth", "token": "<jwt>"}  (must be first message)
      - {"type": "typing"}
      - {"type": "stop_typing"}
      - {"type": "ack", "message_id": <int>}

    Server sends JSON messages:
      - {"type": "new_message", "message": {...}}
      - {"type": "message_edited", "message_id": <int>, "content": "<str>"}
      - {"type": "message_deleted", "message_id": <int>}
      - {"type": "typing", "user_id": <int>, "username": "<str>"}
      - {"type": "stop_typing", "user_id": <int>}
      - {"type": "delivery_ack", "message_id": <int>, "status": "delivered"}
      - {"type": "error", "detail": "<str>"}
    """
    # Accept the WebSocket connection first, then wait for auth
    await websocket.accept()

    # Wait for authentication message
    try:
        auth_data = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4001, reason="Expected auth message")
        return

    if auth_data.get("type") != "auth" or not auth_data.get("token"):
        try:
            await websocket.close(code=4001, reason="First message must be auth")
        except Exception:
            pass
        return

    # Validate token
    with Session(engine) as session:
        user = authenticate_ws_token(auth_data["token"], session)
        if not user:
            try:
                await websocket.close(code=4003, reason="Invalid token")
            except Exception:
                pass
            return

        # Check server membership
        membership = session.exec(
            select(ServerMembership).where(
                ServerMembership.server_id == server_id,
                ServerMembership.user_id == user.id
            )
        ).first()

        if not membership:
            try:
                await websocket.close(code=4003, reason="Not a member of this server")
            except Exception:
                pass
            return

        if is_banned_from_server(user.id, server_id, session):
            try:
                await websocket.close(code=4003, reason="Banned from this server")
            except Exception:
                pass
            return

        user_id = user.id
        username = user.username

    # Register connection (already accepted above)
    await manager.connect(websocket, server_id, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "typing":
                await manager.broadcast_to_server(server_id, {
                    "type": "typing",
                    "user_id": user_id,
                    "username": username,
                }, exclude_user_id=user_id)

            elif msg_type == "stop_typing":
                await manager.broadcast_to_server(server_id, {
                    "type": "stop_typing",
                    "user_id": user_id,
                }, exclude_user_id=user_id)

            elif msg_type == "ack":
                message_id = data.get("message_id")
                if message_id is not None:
                    await manager.send_to_user_in_server(server_id, user_id, {
                        "type": "delivery_ack",
                        "message_id": message_id,
                        "status": "delivered",
                    })

    except WebSocketDisconnect:
        manager.disconnect(websocket, server_id, user_id)
        # Notify others that user stopped typing on disconnect
        await manager.broadcast_to_server(server_id, {
            "type": "stop_typing",
            "user_id": user_id,
        })
    except Exception:
        manager.disconnect(websocket, server_id, user_id)


@router.websocket("/ws/dm")
async def dm_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for DM notifications and typing indicators.
    Not tied to a specific server - receives all DM-related events.

    Client sends:
      - {"type": "auth", "token": "<jwt>"}  (must be first message)
      - {"type": "dm_typing", "conversation_id": <int>}
      - {"type": "dm_stop_typing", "conversation_id": <int>}

    Server sends:
      - {"type": "dm_new_message", "conversation_id": <int>, "message": {...}}
      - {"type": "dm_message_edited", "conversation_id": <int>, ...}
      - {"type": "dm_message_deleted", "conversation_id": <int>, ...}
      - {"type": "dm_typing", "conversation_id": <int>, "user_id": <int>, "username": "<str>"}
      - {"type": "dm_stop_typing", "conversation_id": <int>, "user_id": <int>}
      - {"type": "friend_request", "from_user": {...}}
      - {"type": "friend_accepted", "friend": {...}}
    """
    await websocket.accept()

    # Wait for authentication message
    try:
        auth_data = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4001, reason="Expected auth message")
        return

    if auth_data.get("type") != "auth" or not auth_data.get("token"):
        try:
            await websocket.close(code=4001, reason="First message must be auth")
        except Exception:
            pass
        return

    # Validate token
    with Session(engine) as session:
        user = authenticate_ws_token(auth_data["token"], session)
        if not user:
            try:
                await websocket.close(code=4003, reason="Invalid token")
            except Exception:
                pass
            return
        user_id = user.id
        username = user.username

    # Register DM connection
    await manager.connect_dm(websocket, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "dm_typing":
                conversation_id = data.get("conversation_id")
                if conversation_id is not None:
                    # Get conversation members and notify them
                    with Session(engine) as session:
                        members = session.exec(
                            select(ConversationMember).where(
                                ConversationMember.conversation_id == conversation_id
                            )
                        ).all()
                        for m in members:
                            if m.user_id != user_id:
                                await manager.send_to_user(m.user_id, {
                                    "type": "dm_typing",
                                    "conversation_id": conversation_id,
                                    "user_id": user_id,
                                    "username": username,
                                })

            elif msg_type == "dm_stop_typing":
                conversation_id = data.get("conversation_id")
                if conversation_id is not None:
                    with Session(engine) as session:
                        members = session.exec(
                            select(ConversationMember).where(
                                ConversationMember.conversation_id == conversation_id
                            )
                        ).all()
                        for m in members:
                            if m.user_id != user_id:
                                await manager.send_to_user(m.user_id, {
                                    "type": "dm_stop_typing",
                                    "conversation_id": conversation_id,
                                    "user_id": user_id,
                                })

    except WebSocketDisconnect:
        manager.disconnect_dm(websocket, user_id)
    except Exception:
        manager.disconnect_dm(websocket, user_id)