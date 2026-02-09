import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  List,
  ListItemButton,
  ListItemText,
  Button,
  Typography,
  Tooltip,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { leaveServer, generateInviteLink } from "../../api";
import RolesSettings from "./RolesSettings";
import AdminPanel from "./AdminPanel";
import ServerSettings from "./ServerSettings";
import InviteList from "./InviteList";

interface Server {
  id: number;
  name: string;
  icon_url?: string;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  serverName?: string;
  serverId: number;
  token: string;
  logout: () => void;
  isOwner: boolean;
  servers: Server[];
  selectedServer: Server | null;
  setSelectedServer: (server: Server) => void;
  setServers: React.Dispatch<React.SetStateAction<Server[]>>;
  onLeaveServer: () => void;
  selectedServerOwnerId: number;
}

const pages = ["Admin", "Invite", "Roles", "Server Settings"] as const;

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  serverName,
  serverId,
  token,
  logout,
  isOwner,
  servers,
  selectedServer,
  setSelectedServer,
  setServers,
  onLeaveServer,
  selectedServerOwnerId,
}) => {
  const [selectedPage, setSelectedPage] = useState<typeof pages[number]>("Admin");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteRefreshCounter, setInviteRefreshCounter] = useState(0);


  const handleLeave = async () => {
    if (isOwner) return;
    try {
      setLoading(true);
      await leaveServer(token, serverId, logout);
      onLeaveServer();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvite = async () => {
    try {
      setLoading(true);
      const res = await generateInviteLink(token, serverId, logout);
      const generatedLink = `${window.location.origin}/invite/${res.token}`;
      setInviteLink(generatedLink);
      setInviteRefreshCounter((prev) => prev + 1); // ⬅️ trigger refresh
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          bgcolor: "#2f3136",
          color: "white",
          borderBottom: "1px solid #202225",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
        }}
      >
        {serverName ? `${serverName} Settings` : "Server Settings"}
      
        <Tooltip title="Close">
          <IconButton
            onClick={onClose}
            sx={{
              color: "#b9bbbe",
              "&:hover": { color: "#fff" },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent
        sx={{
          display: "flex",
          height: 800,
          p: 0,
          bgcolor: "#2f3136",
          color: "white",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {/* Sidebar */}
        <Box
          sx={{
            width: 180,
            bgcolor: "#202225",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <List disablePadding>
            {pages.map((page) => (
              <ListItemButton
                key={page}
                selected={selectedPage === page}
                onClick={() => setSelectedPage(page)}
                sx={{
                  color: "white",
                  "&.Mui-selected": {
                    bgcolor: "#5865F2",
                    "&:hover": { bgcolor: "#4752c4" },
                  },
                  "&:hover": { bgcolor: "#40444b" },
                }}
              >
                <ListItemText primary={page} />
              </ListItemButton>
            ))}
          </List>

          <Box sx={{ p: 2, borderTop: "1px solid #292b2f" }}>
            <Tooltip
              title={isOwner ? "You are the owner and cannot leave your own server" : ""}
              arrow
              disableHoverListener={!isOwner}
            >
              <span>
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  onClick={handleLeave}
                  disabled={isOwner || loading}
                  sx={{ textTransform: "none" }}
                >
                  Leave Server
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, p: 3, overflowY: "auto" }}>
        {selectedPage === "Admin" && (
          <AdminPanel serverId={serverId} token={token} logout={logout} selectedServerOwnerId={selectedServerOwnerId}/>
        )}

        {selectedPage === "Invite" && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Invite People to Server
            </Typography>

            <Button
              variant="contained"
              onClick={handleGenerateInvite}
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? "Generating..." : "Generate Invite Link"}
            </Button>

            {inviteLink && (
              <Box mt={2}>
                <Typography variant="body2" color="gray">
                  Newly generated invite:
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    bgcolor: "#36393f",
                    p: 1,
                    borderRadius: 1,
                    mt: 1,
                  }}
                >
                  <Typography sx={{ flexGrow: 1, wordBreak: "break-all" }}>
                    {inviteLink}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    sx={{ ml: 2 }}
                  >
                    Copy
                  </Button>
                </Box>
              </Box>
            )}

            <Box mt={4}>
              <Typography variant="subtitle1">Existing Invite Links</Typography>
              <InviteList serverId={serverId} token={token} logout={logout} refreshTrigger={inviteRefreshCounter}/>
            </Box>
          </Box>
        )}


        {selectedPage === "Roles" && (
          <RolesSettings serverId={serverId} token={token} logout={logout} />
        )}
        {selectedPage === "Server Settings" && (
          <ServerSettings
            serverId={serverId}
            token={token}
            logout={logout}
            currentIcon={selectedServer?.icon_url}
            currentName={serverName || ""}
            isOwner={isOwner}
            onServerRenamed={(newName) => {
              // Optional: update parent state or re-fetch servers
              console.log("Server renamed to", newName);
            }}
            onServerDeleted={() => {
              // Redirect or close dialog after deletion
              onLeaveServer()
              onClose();
              // Optional: refresh server list, etc.
            }}
          />
        )}

        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
