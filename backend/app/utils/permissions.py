from app.models import User, Server, Role, RolePermission, ServerMembershipRole
from sqlmodel import Session, select

SERVER_PERMISSIONS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_ROLES",
  "MANAGE_SERVER",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "DELETE_MESSAGES",
  "MANAGE_CHANNELS",
]

def is_server_owner(user: User, server_id: int, session: Session) -> bool:
    """Check if the user is the owner of the given server."""
    server = session.get(Server, server_id)
    if not server:
        return False
    return user.id == server.owner_id

def has_permission(user: User, server_id: int, permission: str, session: Session) -> bool:
    stmt = (
        select(RolePermission)
        .join(Role, Role.id == RolePermission.role_id)
        .join(ServerMembershipRole, ServerMembershipRole.role_id == Role.id)
        .where(
            (ServerMembershipRole.user_id == user.id) &
            (ServerMembershipRole.server_id == server_id) &
            (RolePermission.permission == permission)
        )
    )
    rp = session.exec(stmt).first()
    return rp is not None
