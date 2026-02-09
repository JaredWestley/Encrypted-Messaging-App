import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Avatar,
} from "@mui/material";
import { renameServer, deleteServer, uploadServerIcon } from "../../api";

interface ServerSettingsProps {
  serverId: number;
  token: string;
  logout: () => void;
  currentIcon?: string;
  currentName: string;
  isOwner: boolean;
  onServerDeleted: () => void;
  onServerRenamed: (newName: string) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({
  serverId,
  token,
  logout,
  currentIcon,
  currentName,
  isOwner,
  onServerDeleted,
  onServerRenamed,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [serverIconUrl, setServerIconUrl] = useState<string | null>(null);

  const handleRename = async () => {
    if (!newName.trim() || newName === currentName) return;

    try {
      setLoading(true);
      const response = await renameServer(token, serverId, newName, logout);
      onServerRenamed(newName);
      setSnackbarMessage(response.detail || "Server renamed successfully.");
      setSnackbarOpen(true);
    } catch (err: any) {
      alert(err.message || "Failed to rename server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      await deleteServer(token, serverId, logout);
      onServerDeleted();
    } catch (err: any) {
      alert(err.message || "Failed to delete server.");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };
  
  const handleIconUpload = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
  
    try {
      const res = await uploadServerIcon(formData, serverId, token, logout);
      setServerIconUrl("http://localhost:8000" + res.icon_url); // update preview
      setPreviewUrl(null);
      setSelectedFile(null);
      setSnackbarMessage("Server icon uploaded successfully.");
      setSnackbarOpen(true);
    } catch (error: any) {
      alert("Upload failed: " + error.message);
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
    <Box>
      <Typography variant="h6" gutterBottom>
        Edit Server
      </Typography>

      <TextField
        label="Server Name"
        variant="filled"
        fullWidth
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        disabled={loading}
        sx={{
          mt: 2,
          mb: 2,
          bgcolor: "#202225",
          borderRadius: 1,
        }}
        InputProps={{
          style: { color: "white" },
        }}
        InputLabelProps={{
          style: { color: "rgba(255, 255, 255, 0.7)" },
        }}
      />

      <Button
        variant="contained"
        onClick={handleRename}
        disabled={loading || !newName.trim() || newName === currentName}
      >
        Save Changes
      </Button>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1">Server Icon</Typography>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
          />
        ) : currentIcon ? (
          <img
            src={"http://localhost:8000" + currentIcon}
            alt="Current Icon"
            style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
          />
        ) : serverIconUrl ? (
          <img
            src={serverIconUrl}
            alt="Server Icon"
            style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
          />
        ) : (
          <Avatar
            alt={currentName}
            src={currentIcon ? `http://localhost:8000${currentIcon}` : undefined}
            sx={{ width: 80, height: 80, bgcolor: "#757575", fontSize: "2rem" }}
          >
            {!currentIcon && getFirstLetter(currentName)}
          </Avatar>
        )}
        <Box display="flex" gap={2}>
          <Button variant="outlined" component="label">
            Choose Icon
            <input type="file" hidden accept="image/*" onChange={handleFileChange} />
          </Button>
          <Button
            variant="contained"
            onClick={handleIconUpload}
            disabled={!selectedFile}
          >
            Upload
          </Button>
        </Box>
      </Box>

      {isOwner && (
        <>
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" color="error" gutterBottom>
              Danger Zone
            </Typography>
            <Typography variant="body2" color="gray">
              Deleting a server is permanent and cannot be undone.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              sx={{ mt: 2 }}
              onClick={() => setConfirmOpen(true)}
              disabled={loading}
            >
              Delete Server
            </Button>
          </Box>

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogContent>
              <Typography>
                Are you sure you want to delete this server? This action is irreversible.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button color="error" onClick={handleDelete} disabled={loading}>
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled">
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ServerSettings;
