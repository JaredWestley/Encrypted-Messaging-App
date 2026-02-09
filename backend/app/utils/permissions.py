from app.models import User, Server
from sqlmodel import Session

SERVER_PERMISSIONS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_ROLES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "DELETE_MESSAGES"
  # add your permission strings here...
]

def is_server_owner(user: User, server: Server) -> bool:
    return user.id == 1

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
