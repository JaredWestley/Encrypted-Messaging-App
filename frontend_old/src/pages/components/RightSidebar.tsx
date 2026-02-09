import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Avatar
} from "@mui/material";
import { fetchUsersInServer } from "../../api";
import { useAuth } from "../../context/AuthContext";

interface User {
  id: number;
  username: string;
  icon_url: string;
}

interface RightSidebarProps {
  serverId: number;
  token: string;
  onEditUser: (user: User) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  serverId,
  token,
  onEditUser,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { logout } = useAuth();

  useEffect(() => {
    if (!serverId || !token) {
      setUsers([]);
      setError("Unable to load users: no server selected.");
      return;
    }

    setError(null);

    const loadUsers = async () => {
      try {
        const users = await fetchUsersInServer(token, serverId, logout);
        setUsers(users);
        console.log(users)
      } catch (err) {
        console.error("Failed to fetch users:", err);
        setError("Unable to load users.");
        setUsers([]);
      }
    };

    loadUsers();
  }, [serverId, token, logout]);

  return (
    <Box
      sx={{
        width: 240,
        bgcolor: "#2f3136",
        borderLeft: "1px solid #202225",
        display: "flex",
        flexDirection: "column",
        color: "#b9bbbe",
        height: "100%",
      }}
    >
      <Box
        sx={{
          height: 64,
          px: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #202225",
          flexShrink: 0,
          backgroundColor: "#2f3136",
          boxShadow: "inset 0 -1px 0 rgba(32,34,37,0.6)",
        }}
      >
        <Typography variant="subtitle1" sx={{ color: "white" }}>
          {error ? "Users (?)" : `Users (${users.length})`}
        </Typography>
      </Box>

      {!error ? (
        <List sx={{ overflowY: "auto", flexGrow: 1 }}>
          {users.map((user) => (
            <ListItemButton
              key={user.id}
              onClick={() => onEditUser(user)}
              sx={{
                py: 0.5,
                px: 1,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                "&:hover": {
                  bgcolor: "#40444b",
                  cursor: "pointer",
                },
              }}
            >
              <Avatar
                alt={user.username}
                src={"http://localhost:8000" + user.icon_url}
                sx={{ width: 32, height: 32, mr: 1.5 }}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    color: "#b9bbbe",
                    fontSize: "0.875rem",
                  }}
                >
                  {user.username}
                </Typography>
              </Box>
              <IconButton
                edge="end"
                aria-label="edit user"
                size="small"
                sx={{ color: "#b9bbbe" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditUser(user);
                }}
              />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Box sx={{ p: 2, color: "#ff5555" }}>
          <Typography variant="body2">{error}</Typography>
        </Box>
      )}
    </Box>
  );
};

export default RightSidebar;
