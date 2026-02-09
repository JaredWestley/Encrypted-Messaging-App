import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  Avatar,
  Box,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { fetchUsersInServer } from "../../api"; // Your api call
import { useAuth } from "../../context/AuthContext";

interface User {
  id: number;
  username: string;
}

interface ServerUser {
  id: number;
  username: string;
  icon_url: string | null;
}

interface UserProfileDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  serverId: number;
}

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  open,
  user,
  onClose,
  serverId,
}) => {
  const [detailedUser, setDetailedUser] = useState<ServerUser | null>(null);
  const { token, logout } = useAuth();

  useEffect(() => {
    if (!open || !user || !token) {
      setDetailedUser(null);
      return;
    }

    const loadUserDetails = async () => {
      try {
        const users = await fetchUsersInServer(token, serverId, logout);
        const matchedUser = users.find((u) => u.id === user.id) || null;
        setDetailedUser(matchedUser);
      } catch (err) {
        console.error("Failed to fetch user details:", err);
        setDetailedUser(null);
      }
    };

    loadUserDetails();
  }, [open, user, token, serverId, logout]);

  if (!user) return null;

  const displayUser = detailedUser || { ...user, icon_url: null };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          bgcolor: "#2f3136",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          User Profile
        </Typography>
        <Tooltip title="Close">
          <IconButton
            onClick={onClose}
            sx={{
              color: "#b9bbbe",
              "&:hover": {
                color: "#fff",
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: "#36393f", color: "#fff", px: 3, py: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 3, mt: 2 }}>
          {/* <Avatar
            src={
              displayUser.icon_url
                ? `http://localhost:8000${displayUser.icon_url}`
                : undefined
            }
            sx={{
              width: 72,
              height: 72,
              fontSize: 32,
              bgcolor: displayUser.icon_url ? "transparent" : "#5865F2",
              border: "2px solid #202225",
            }}
          >
            {!displayUser.icon_url &&
              displayUser.username.charAt(0).toUpperCase()}
          </Avatar> */}
          <Avatar
            alt={displayUser.username}
            src={displayUser.icon_url ? `http://localhost:8000${displayUser.icon_url}` : undefined}
            sx={{ width: 80, height: 80, bgcolor: "#757575", fontSize: "2rem" }}
          >
            {!displayUser.icon_url && getFirstLetter(displayUser.username)}
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {displayUser.username}
            </Typography>
            <Typography variant="body2" sx={{ color: "#b9bbbe", mt: 0.5 }}>
              User ID: {displayUser.id}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3, borderColor: "#202225" }} />

        <Typography
          variant="subtitle2"
          sx={{
            textTransform: "uppercase",
            fontSize: 12,
            fontWeight: 600,
            color: "#b9bbbe",
            letterSpacing: 1,
            mb: 1,
          }}
        >
          About
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "#dcddde",
            lineHeight: 1.6,
          }}
        >
          This is a placeholder for more user information, such as bio, roles,
          or recent activity.
        </Typography>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;
