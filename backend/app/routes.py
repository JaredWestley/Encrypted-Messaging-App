from fastapi import APIRouter, HTTPException, status, Depends, Query, Request, Body, File, UploadFile
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.extension import Limiter
from typing import List
from sqlmodel import Session, select, delete
from app.schemas import MessageCreate, MessageUpdate, UserCreate, RoleAssign, LoginRequest, Token, UserRead, PublicUserRead, RoleRead, RoleCreate, ServerInviteRead, ServerInviteCreate, ServerRead, ServerUpdate, UserUpdate
from app.models import User, Server, Message, ServerMembership, ServerInvite, ServerMembershipRole, Role, ServerBan, RolePermission
from app.database import get_session, engine
from app.auth import hash_password, verify_password, create_access_token
from app.utils.permissions import is_server_owner, has_permission
from passlib.context import CryptContext
from datetime import timedelta, datetime
from jose import JWTError, jwt
from app.rate_limit import limiter
from sqlalchemy.orm import joinedload
import os
from uuid import uuid4

# Import services which will handle the logic

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "user_icons")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SECRET_KEY = "your-secret-key"  # 🔐 Use the same as in create_access_token
ALGORITHM = "HS256"

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = session.exec(select(User).where(User.username == username)).first()
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
    return {"detail": "Message sent"}

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
        if not (is_server_owner(current_user, server_id) or
                has_permission(current_user, server_id, "DELETE_MESSAGES", session)):
            raise HTTPException(status_code=403, detail="You can only delete your own messages")

    session.delete(db_message)
    session.commit()
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
    if not (is_server_owner(current_user, server_id) or
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
    if not (is_server_owner(current_user, server_id) or
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
    if not (is_server_owner(current_user, server_id) or has_permission(current_user, server_id, "ban", session)):
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
    if not (is_server_owner(current_user, server_id) or has_permission(current_user, server_id, "ban", session)):
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

# Friends
@router.post("/friends/{friend_id}")
async def add_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # logic to add friend
    return {"detail": "Friend added"}

@router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # logic to remove friend
    return {"detail": "Friend removed"}

@router.post("/auth/register", response_model=UserCreate, status_code=201)
def register(user: UserCreate, session: Session = Depends(get_session)):
    print("Register route was called")
    existing_user = session.exec(select(User).where(User.username == user.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = hash_password(user.password)
    user_obj = User(username=user.username, email=user.email, password=hashed_password)
    session.add(user_obj)
    session.commit()
    print("User created:", user_obj.username)
    users = session.exec(select(User)).all()
    print("All users in DB:", [u.username for u in users])
    session.refresh(user_obj)
    return user_obj


@router.post("/auth/login")
def login(user: LoginRequest, session: Session = Depends(get_session)):
    print("Login attempt for user:", user.username)
    db_user = session.exec(select(User).where(User.username == user.username)).first()
    if not db_user:
        print("User not found")
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not verify_password(user.password, db_user.password):
        print("Password check failed")
        raise HTTPException(status_code=401, detail="Invalid username or password")

    print("Password verified!")
    
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": db_user.username},
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer", "userId": db_user.id}

@router.get("/users/me", response_model=UserRead)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    print(current_user)
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




# def clear_all_users():
#     with Session(engine) as session:
#         session.exec(delete(User))
#         session.commit()
#         print("All users deleted from the database.")

# clear_all_users()

# def clear_all_servers():
#     with Session(engine) as session:
#         session.exec(delete(Server))
#         session.commit()
#         print("All servers deleted from the database.")

# clear_all_servers()