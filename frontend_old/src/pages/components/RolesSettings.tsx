import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  TextField,
  Checkbox,
  FormControlLabel,
  Divider,
  CircularProgress,
  IconButton,
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete';
import { fetchRoles, createRole as apiCreateRole, updateRole as apiUpdateRole, deleteRole as apiDeleteRole, fetchUsersInServer, fetchPermissions, assignRole, unassignRole } from '../../api';

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

interface RolesSettingsProps {
  serverId: number;
  token: string;
  logout: () => void;
}

const RolesSettings: React.FC<RolesSettingsProps> = ({ serverId, token, logout }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([]);
  const [originalUserIds, setOriginalUserIds] = useState<number[]>([]);
  const originalUserIdsRef = useRef<number[]>([]);


  useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    try {
      const rolesData = await fetchRoles(token, serverId, logout);
      const usersData = await fetchUsersInServer(token, serverId, logout);
      const permissionsData = await fetchPermissions(token, logout); // new fetch

      console.log(availablePermissions)
      setRoles(rolesData);
      setUsers(usersData);
      setAvailablePermissions(permissionsData); // set it here
      if (rolesData.length > 0) setSelectedRoleId(rolesData[0].id);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, [serverId, token]);

  // Fetch roles and users
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const rolesData = await fetchRoles(token, serverId, logout);
        // Assuming fetchRoles returns roles with users included or you fetch users separately?
        // If users come separately, add separate fetchUsers API and call it here:
        // For now, let's assume users need to be fetched similarly:
        const usersData = await fetchUsersInServer(token, serverId, logout);

        console.log("rolesData" + rolesData);
        console.log("usersData" + usersData);

        setRoles(rolesData);
        setUsers(usersData);
        if (rolesData.length > 0) setSelectedRoleId(rolesData[0].id);
      } catch (error: any) {
        alert(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [serverId, token]);

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null;

  useEffect(() => {
  if (selectedRole) {
    originalUserIdsRef.current = selectedRole.users?.map(u => u.id) || [];
  }
}, [selectedRole]);

  // Update role name locally
  const updateRoleName = (name: string) => {
    if (!selectedRole) return;
    setRoles(roles.map(r => (r.id === selectedRole.id ? { ...r, name } : r)));
  };

  // Toggle permission checkbox locally
  const togglePermission = (perm: Permission) => {
    if (!selectedRole) return;
    const hasPermission = selectedRole.permissions.includes(perm);
    const newPerms = hasPermission
      ? selectedRole.permissions.filter(p => p !== perm)
      : [...selectedRole.permissions, perm];
    setRoles(
      roles.map(r => (r.id === selectedRole.id ? { ...r, permissions: newPerms } : r))
    );
  };

  // Assign/unassign user to selected role locally
  const toggleUserRole = (user: User) => {
    if (!selectedRole) return;
  
    const users = selectedRole.users ?? []; // fallback to empty array if undefined
    const hasUser = users.some(u => u.id === user.id);
    const newUsers = hasUser
      ? users.filter(u => u.id !== user.id)
      : [...users, user];
  
    setRoles(
      roles.map(r =>
        r.id === selectedRole.id ? { ...r, users: newUsers } : r
      )
    );
  };
  

  // Save role changes to server
  const saveRole = async () => {
  if (!selectedRole) return;
  setSaving(true);
  try {
    // Update role's basic info and permissions
    await apiUpdateRole(token, serverId, selectedRole.id, selectedRole.name, selectedRole.permissions, [], logout, selectedRole.is_default || false);

    // Compute added and removed users
    const newUserIds = selectedRole.users?.map(u => u.id) || [];
const addedUserIds = newUserIds.filter(id => !originalUserIdsRef.current.includes(id));
const removedUserIds = originalUserIdsRef.current.filter(id => !newUserIds.includes(id));

console.log("Adding users:", addedUserIds);
console.log("Removing users:", removedUserIds);



    // Call assignRole API for added users
    for (const userId of addedUserIds) {
      await assignRole(token, serverId, userId, selectedRole.id, logout);
    }

    // Call unassignRole API for removed users
    for (const userId of removedUserIds) {
      await unassignRole(token, serverId, userId, selectedRole.id, logout);
    }

    alert("Role saved");
    // Update originalUserIds to current state after save
    setOriginalUserIds(newUserIds);
  } catch (error: any) {
    alert(error.message);
  } finally {
    setSaving(false);
  }
};


  // Create a new role
  const createRole = async () => {
    if (!newRoleName.trim()) return alert("Role name cannot be empty");
    setSaving(true);
    try {
      const createdRole = await apiCreateRole(token, serverId, newRoleName.trim(), logout);
      setRoles([...roles, createdRole]);
      setSelectedRoleId(createdRole.id);
      setNewRoleName("");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete selected role
  const deleteRole = async () => {
    if (!selectedRole) return;
    if (!window.confirm(`Delete role "${selectedRole.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await apiDeleteRole(token, serverId, selectedRole.id, logout);
      setRoles(roles.filter(r => r.id !== selectedRole.id));
      setSelectedRoleId(roles.length > 1 ? roles[0].id : null);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress color="inherit" />;

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      {/* Roles List */}
      <Box
        sx={{
          width: 200,
          bgcolor: "#202225",
          color: "white",
          p: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography variant="h6" mb={1}>
          Roles
        </Typography>
        <List sx={{ flexGrow: 1, overflowY: "auto" }}>
          {roles.map(role => (
            <ListItemButton
              key={role.id}
              selected={role.id === selectedRoleId}
              onClick={() => setSelectedRoleId(role.id)}
              sx={{ color: "white" }}
            >
              <ListItemText primary={role.name} />
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ mt: 1 }}>
          <TextField
            label="New Role Name"
            size="small"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            fullWidth
            sx={{ mb: 1 }}
          />
          <Button
            variant="contained"
            fullWidth
            onClick={createRole}
            disabled={saving}
          >
            Create Role
          </Button>
        </Box>
      </Box>

      {/* Role Details */}
      <Box
        sx={{
          flexGrow: 1,
          bgcolor: "#2f3136",
          color: "white",
          p: 2,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!selectedRole ? (
          <Typography>Select a role to view/edit details.</Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <TextField
                label="Role Name"
                variant="filled"
                value={selectedRole.name}
                onChange={e => updateRoleName(e.target.value)}
                sx={{ bgcolor: "#202225", flexGrow: 1, mr: 2 }}
                InputProps={{ style: { color: "white" } }}
              />
              <IconButton
                color="error"
                onClick={deleteRole}
                disabled={saving}
                title="Delete Role"
              >
                <DeleteIcon />
              </IconButton>
            </Box>

            <Divider sx={{ bgcolor: "#444" }} />

            <Typography variant="subtitle1" mt={2} mb={1}>
              Permissions
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                maxHeight: 180,
                overflowY: "auto",
                bgcolor: "#202225",
                p: 1,
                borderRadius: 1,
              }}
            >
            {availablePermissions.map(perm => (
              <FormControlLabel
                key={perm}
                control={
                  <Checkbox
                    checked={selectedRole.permissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    sx={{ color: "white" }}
                  />
                }
                label={PERMISSION_LABELS[perm] || perm}
                sx={{ color: "white" }}
              />
            ))}
            </Box>
            <Divider sx={{ bgcolor: "#444", mt: 2 }} />

            <Typography variant="subtitle1" mt={2} mb={1}>
              Assigned Users
            </Typography>
            <Box
              sx={{
                maxHeight: 200,
                overflowY: "auto",
                bgcolor: "#202225",
                p: 1,
                borderRadius: 1,
              }}
            >
              {users.map(user => {
  const assigned = selectedRole.users?.some(u => u.id === user.id) ?? false;
  return (
    <FormControlLabel
      key={user.id}
      control={
        <Checkbox
          checked={assigned}
          onChange={() => toggleUserRole(user)}
          sx={{ color: "white" }}
        />
      }
      label={user.username}
      sx={{ color: "white" }}
    />
  );
})}

            </Box>

            <Box sx={{ mt: "auto", textAlign: "right" }}>
              <Button
                variant="contained"
                onClick={saveRole}
                disabled={saving}
                sx={{ mt: 2 }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default RolesSettings;
