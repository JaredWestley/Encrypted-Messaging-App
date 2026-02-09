import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Snackbar,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
} from "@mui/material";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import BlockIcon from "@mui/icons-material/Block";
import UndoIcon from "@mui/icons-material/Undo";
import { fetchUsersInServer, fetchUserRoles, kickUser as kickUserApi, banUser as banUserApi, fetchBannedUsers, unbanUser as unbanUserApi, fetchRoles, assignRole, unassignRole } from "../../api";
import { useAuth } from "../../context/AuthContext";

const SERVER_PERMISSIONS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "MANAGE_ROLES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "DELETE_MESSAGES"
  // add your permission strings here...
];

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_CHANNEL: "View Channel",
  SEND_MESSAGES: "Send Messages",
  MANAGE_ROLES: "Manage Roles",
  KICK_MEMBERS: "Kick Members",
  BAN_MEMBERS: "Ban Members",
  DELETE_MESSAGES: "Delete Messages",
  // Add more as needed...
};

type Permission = typeof SERVER_PERMISSIONS[number];

interface Role {
  id: number;
  name: string;
  permissions: Permission[];
  users: User[];
  is_default?: boolean; // Add this
}

interface User {
  id: number;
  username: string;
}

interface AdminPanelProps {
  serverId: number;
  token: string;
  logout: () => void;
  selectedServerOwnerId: number;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ serverId, token, logout, selectedServerOwnerId }) => {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canKick, setCanKick] = useState(false);
  const [canBan, setCanBan] = useState(false);
  const [bannedUsers, setBannedUsers] = useState<User[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<{ [userId: number]: number[] }>({});


  const { userId } = useAuth();

  const showToast = (message: string) => {
    setSnackbar({ open: true, message });
  };

  const kickUser = (targetUserId: number) => {
    kickUserApi(token, serverId, targetUserId, logout)
      .then(() => setMembers(prev => prev.filter(m => m.id !== targetUserId)))
      .catch(err => setError(`Failed to kick user: ${err.message}`));
  };

  const banUser = (targetUserId: number) => {
    banUserApi(token, serverId, targetUserId, logout)
      .then(() => setMembers(prev => prev.filter(m => m.id !== targetUserId)))
      .catch(err => setError(`Failed to ban user: ${err.message}`));
  };

  useEffect(() => {
    if (!token || !serverId) return;
    
    fetchRoles(token, serverId, logout)
      .then((roles) => {
        setAllRoles(roles);
      
        const userRolesTemp: { [key: number]: number[] } = {};
        roles.forEach((role) => {
          role.users.forEach((u) => {
            if (!userRolesTemp[u.id]) userRolesTemp[u.id] = [];
            userRolesTemp[u.id].push(role.id);
          });
        });
      
        setUserRolesMap(userRolesTemp);
      })
      .catch((err) => {
        setError(`Failed to load roles: ${err.message}`);
      });
  }, [token, serverId, logout]);


  const handleRoleChange = async (userId: number, roleIds: number[]) => {
    const prevRoles = userRolesMap[userId] || [];
    
    const toAssign = roleIds.filter((id) => !prevRoles.includes(id));
    const toUnassign = prevRoles.filter((id) => !roleIds.includes(id));
    
    try {
      await Promise.all([
        ...toAssign.map((roleId) => assignRole(token, serverId, userId, roleId, logout)),
        ...toUnassign.map((roleId) => unassignRole(token, serverId, userId, roleId, logout)),
      ]);
    
      setUserRolesMap((prev) => ({
        ...prev,
        [userId]: roleIds,
      }));
      showToast("Roles updated");
    } catch (err: any) {
      showToast("Failed to update roles");
    }
  };



  useEffect(() => {
    if (!serverId || !token) return;
    setLoading(true);

    fetchUsersInServer(token, serverId, logout)
      .then((fetchedMembers) => {
        setMembers(fetchedMembers);
        return fetchUserRoles(token, serverId, userId!, logout);
      })
      .then((roleData) => {
        const permissions = roleData.flatMap((role) => role.permissions || []);
        const isOwner = userId === selectedServerOwnerId;

        setCanKick(isOwner || permissions.includes("KICK_MEMBERS"));
        setCanBan(isOwner || permissions.includes("BAN_MEMBERS"));

        return fetchBannedUsers(token, serverId, logout);
      })
      .then((banned) => setBannedUsers(banned))
      .catch(() => setError("Unable to load members or permissions"))
      .finally(() => setLoading(false));
  }, [serverId, token, logout, userId, selectedServerOwnerId]);


  const unbanUser = (targetUserId: number) => {
    unbanUserApi(token, serverId, targetUserId, logout)
      .then(() => setBannedUsers(prev => prev.filter(u => u.id !== targetUserId)))
      .catch(err => setError(`Failed to unban user: ${err.message}`));
  };

  if (loading) return <CircularProgress sx={{ color: "white" }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Members ({members.length})
      </Typography>

      <List disablePadding sx={{ bgcolor: "#202225", borderRadius: 1 }}>
        {members.map((user) => {
          const isOwner = user.id === selectedServerOwnerId;

          const kickDisabled = isOwner || !canKick;
          const banDisabled = isOwner || !canBan;

          return (
            <ListItem
              key={user.id}
              secondaryAction={
                <Box>
                  <Tooltip
                    title={
                      isOwner
                        ? "You cannot kick the server owner"
                        : !canKick
                        ? "You do not have permission to kick users"
                        : "Kick user"
                    }
                    arrow
                  >
                    <span>
                      <IconButton
                        edge="end"
                        sx={{ color: kickDisabled ? "gray" : "#ffb347", mr: 1 }}
                        disabled={kickDisabled}
                        onClick={() =>
                          kickDisabled
                            ? showToast(isOwner ? "Cannot kick the owner" : "You do not have permission to kick users")
                            : kickUser(user.id)
                        }
                      >
                        <PersonOffIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip
                    title={
                      isOwner
                        ? "You cannot ban the server owner"
                        : !canBan
                        ? "You do not have permission to ban users"
                        : "Ban user"
                    }
                    arrow
                  >
                    <span>
                      <IconButton
                        edge="end"
                        sx={{ color: banDisabled ? "gray" : "#ff5555" }}
                        disabled={banDisabled}
                        onClick={() =>
                          banDisabled
                            ? showToast(isOwner ? "Cannot ban the owner" : "You do not have permission to ban users")
                            : banUser(user.id)
                        }
                      >
                        <BlockIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              }
              sx={{
                "&:hover": { bgcolor: "#2f3136" },
                px: 2,
                py: 1,
                color: "white",
              }}
            >
              <ListItemText primary={user.username} />
              <FormControl fullWidth variant="standard" sx={{ mt: 1 }}>
                <InputLabel sx={{ color: "white" }}>Roles</InputLabel>
                <Select
                  multiple
                  value={userRolesMap[user.id] || []}
                  onChange={(e) => handleRoleChange(user.id, e.target.value as number[])}
                  renderValue={(selected) =>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as number[]).map((roleId) => {
                        const role = allRoles.find(r => r.id === roleId);
                        return <Chip key={roleId} label={role?.name} size="small" />;
                      })}
                    </Box>
                  }
                  sx={{
                    color: "white",
                    ".MuiSvgIcon-root": { color: "white" },
                    ".MuiInputBase-root": { color: "white" },
                  }}
                >
                  {allRoles.map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

            </ListItem>
          );
        })}
      </List>

      {bannedUsers.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 600 }}>
              Banned Members ({bannedUsers.length})
            </Typography>
            
            <List disablePadding sx={{ bgcolor: "#2b2d31", borderRadius: 1 }}>
              {bannedUsers.map((user) => (
                <ListItem
                  key={user.id}
                  secondaryAction={
                    <Tooltip title="Unban user" arrow>
                      <IconButton
                        edge="end"
                        sx={{ color: "#77dd77" }}
                        onClick={() => unbanUser(user.id)}
                      >
                        <UndoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                  sx={{
                    "&:hover": { bgcolor: "#393c43" },
                    px: 2,
                    py: 1,
                    color: "white",
                  }}
                >
                  <ListItemText primary={user.username} />
                </ListItem>
              ))}
            </List>
          </>
        )}


      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        message={snackbar.message}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default AdminPanel;
