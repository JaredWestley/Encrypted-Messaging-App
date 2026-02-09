import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Modal,
  TextField,
  Button,
  List,
  ListItem,
  ListItemButton,
  Snackbar,
  Alert,
  Menu,
  MenuItem,
  Divider,
  Avatar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  createServer,
  fetchServers,
  joinServerWithInvite,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import UserSettingsDialog from "./UserSettingsDialog";

interface Server {
  id: number;
  name: string;
  icon_url?: string;
}

interface ServerSidebarProps {
  servers: Server[];
  selectedServer: Server | null;
  setSelectedServer: (server: Server) => void;
  setServers: React.Dispatch<React.SetStateAction<Server[]>>;
  token: string;
  setError: (err: string | null) => void;
}

const modalStyle = {
  position: "absolute" as const,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  bgcolor: "background.paper",
  borderRadius: 1,
  boxShadow: 24,
  p: 3,
  width: 300,
};

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  servers,
  selectedServer,
  setSelectedServer,
  setServers,
  token,
  setError,
}) => {
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");


  const handleSettingsClick = (event: React.MouseEvent<HTMLElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    setNewServerName("");
    setInviteUrl("");
  };

  const showSnackbar = (message: string, severity: typeof snackbarSeverity = "success") => {
  setSnackbarMessage(message);
  setSnackbarSeverity(severity);
  setSnackbarOpen(true);
};

  const createNewServer = async () => {
  if (!newServerName.trim() || !token) return;
  try {
    await createServer(token, newServerName.trim(), logout);

    const updatedServers = await fetchServers(token, logout) as Server[];

    setServers(updatedServers);

    const newlyCreated = updatedServers[updatedServers.length - 1]; // Or filter by name/id
    setSelectedServer(newlyCreated);

    handleClose();
  } catch (error: any) {
    setError(error.message || "Error creating server");
  }
};

  const extractInviteToken = (url: string): string | null => {
    try {
      const parts = url.split("/invite/");
      if (parts.length === 2) return parts[1].split(/[?#]/)[0];
      return null;
    } catch {
      return null;
    }
  };

  const joinServer = async () => {
    if (!inviteUrl.trim() || !token) return;

    const tokenPart = extractInviteToken(inviteUrl.trim());
    if (!tokenPart) {
      setError("Invalid invite URL format");
      return;
    }

    try {
      await joinServerWithInvite(token, tokenPart, logout);
      const updatedServers = await fetchServers(token, logout) as Server[];

      setServers(updatedServers);

      const newlyJoinedServer = updatedServers.find(
        (s) => !servers.some((prev) => prev.id === s.id)
      );

      if (newlyJoinedServer) {
        setSelectedServer(newlyJoinedServer);
        showSnackbar("Joined server successfully", "success");
      } else if (updatedServers.length > 0) {
        setSelectedServer(updatedServers[0]);
      }

      handleClose();
    } catch (error: any) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.detail === "You are banned from this server") {
          showSnackbar("You are banned from this server", "error");
          return;
        }
        if (parsed.detail === "Invalid or expired invite") {
          showSnackbar("Invalid or expired invite link", "error");
          return;
        }
      } catch {}
      showSnackbar(error.message || "Failed to join server", "error");
    }
  };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <>
      <Box
        sx={{
          width: 160,
          bgcolor: "#202225",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "white",
          height: "100vh",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Create Server Button */}
        <Tooltip title="Create Server" placement="right">
          <IconButton
            onClick={handleOpen}
            sx={{
              bgcolor: "#5865F2",
              color: "white",
              "&:hover": { bgcolor: "#4752C4" },
              width: 56,
              height: 56,
              borderRadius: "50%",
              mt: 1,
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>

        {/* Scrollable Server List */}
        <Box
          sx={{
            flexGrow: 1,
            width: "100%",
            overflowY: "auto",
            mt: 2,
            mb: 8, // leave space for settings button
          }}
        >
          <List
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {servers.map((server, index) => (
              <ListItem
                key={server.id}
                disablePadding
                sx={{
                  width: 56,
                  height: 56,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  mb: index !== servers.length - 1 ? 1.5 : 0,
                }}
              >
                <ListItemButton
                  onClick={() => setSelectedServer(server)}
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    bgcolor:
                      selectedServer?.id === server.id ? "#5865F2" : "transparent",
                    color: "white",
                    "&:hover": { bgcolor: "#4752C4" },
                    justifyContent: "center",
                    px: 0,
                  }}
                >
                  <Avatar
                    alt={server.name}
                    src={server.icon_url ? `http://localhost:8000${server.icon_url}` : undefined}
                    sx={{ width: 40, height: 40, bgcolor: "#757575", fontSize: "1rem" }}
                  >
                    {!server.icon_url && getFirstLetter(server.name)}
                  </Avatar>
                </ListItemButton>

              </ListItem>
            ))}
          </List>
        </Box>

        {/* Settings Icon */}
        <IconButton
          onClick={() => setSettingsOpen(true)}
          sx={{
            position: "absolute",
            bottom: 30.5,
            color: "white",
            bgcolor: "#2f3136",
            "&:hover": { bgcolor: "#40444b" },
            width: 48,
            height: 48,
          }}
        >
          <SettingsIcon />
        </IconButton>
        
        {/* Dialog for user settings */}
        <UserSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          logout={logout}
          token={token}
        />
      </Box>

      {/* Create/Join Modal */}
      <Modal open={open} onClose={handleClose}>
        <Box sx={modalStyle}>
          <Typography variant="h6" gutterBottom>
            Create a Server
          </Typography>
          <TextField
            fullWidth
            label="Server Name"
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            autoFocus
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            fullWidth
            onClick={createNewServer}
            sx={{ mb: 3 }}
          >
            Create
          </Button>

          <Typography variant="h6" gutterBottom>
            Join a Server
          </Typography>
          <TextField
            fullWidth
            label="Invite Link"
            value={inviteUrl}
            onChange={(e) => setInviteUrl(e.target.value)}
            placeholder="http://localhost:3000/invite/yourToken"
            sx={{ mb: 2 }}
          />
          <Button variant="outlined" fullWidth onClick={joinServer}>
            Join Server
          </Button>
        </Box>
      </Modal>

      {/* Snackbar Error Feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>

      </Snackbar>
    </>
  );
};

export default ServerSidebar;
