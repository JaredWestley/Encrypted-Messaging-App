import React, { useEffect, useState } from "react";
import { getServerInvites, deleteInvite } from "../../api";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

interface InviteListProps {
  serverId: number;
  token: string;
  logout: () => void;
  refreshTrigger?: number;
}

const InviteList: React.FC<InviteListProps> = ({ serverId, token, logout, refreshTrigger }) => {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const fetchInvites = async () => {
    try {
      const res = await getServerInvites(token, serverId, logout);
      setInvites(res);
      console.log(res);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, [refreshTrigger]);

  const handleDelete = async (inviteToken: string) => {
    try {
      setDeleting(inviteToken);
      const res = await deleteInvite(token, inviteToken, logout);
      setInvites((prev) => prev.filter((invite) => invite.token !== inviteToken));
      setSnackbarMessage(res.detail || "Invite deleted");
      setSnackbarOpen(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleCloseSnackbar = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") return;
    setSnackbarOpen(false);
  };

  if (loading) return <CircularProgress sx={{ mt: 2 }} />;

  if (invites.length === 0)
    return <Typography color="gray">No active invites</Typography>;

  return (
    <>
      <Box mt={2}>
        {invites.map((invite) => (
          <Box
            key={invite.token}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              bgcolor: "#36393f",
              p: 1,
              borderRadius: 1,
              mb: 1,
            }}
          >
            <Box>
              <Typography sx={{ wordBreak: "break-word" }}>
                {window.location.origin}/invite/{invite.token}
              </Typography>
              <Typography variant="caption" color="gray">
                Created at: {new Date(invite.created_at).toLocaleString()}
              </Typography>
            </Box>
            <IconButton
              edge="end"
              color="error"
              onClick={() => handleDelete(invite.token)}
              disabled={deleting === invite.token}
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
      </Box>

      {/* ✅ Snackbar for delete confirmation */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={handleCloseSnackbar} severity="success" variant="filled">
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default InviteList;
