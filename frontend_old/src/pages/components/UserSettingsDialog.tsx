import { useEffect, useState } from "react";
import {
  TextField,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  IconButton,
  Tooltip,
  Avatar,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { updateUserSettings, fetchCurrentUser, uploadUserIcon } from "../../api";

interface User {
  id: number;
  username: string;
  icon_url: string;
}

interface UserSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  logout: () => void;
}

type ChangeType = "username" | "email" | "password" | null;

const UserSettingsDialog: React.FC<UserSettingsDialogProps> = ({
  open,
  onClose,
  token,
  logout,
}) => {
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [changeDialogOpen, setChangeDialogOpen] = useState<ChangeType>(null);

  // For each change dialog inputs
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [current_password, setCurrentPassword] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [verifyNewPassword, setVerifyNewPassword] = useState("");
  const [currentIcon, setCurrentIcon] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userIconUrl, setUserIconUrl] = useState<string | null>(null);

  // Clear all fields when closing change dialogs
  const resetChangeDialogFields = () => {
    setNewUsername("");
    setNewEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setVerifyNewPassword("");
  };

  // Open a specific change dialog
  const openChangeDialog = (type: ChangeType) => {
    resetChangeDialogFields();
    setChangeDialogOpen(type);
  };

  const closeChangeDialog = () => {
    resetChangeDialogFields();
    setChangeDialogOpen(null);
  };

  // Handle updating username
  const handleUsernameUpdate = async () => {
  if (!newUsername.trim()) {
    alert("Please enter a new username.");
    return;
  }
  if (!current_password) {
    alert("Please confirm your current password.");
    return;
  }
  try {
    const res = await updateUserSettings(
      { username: newUsername, current_password },
      token,
      logout
    );
    alert("Username updated successfully");
    setCurrentUsername(res.user.username);
    closeChangeDialog();
  } catch (error: any) {
    alert("Error: " + error.message);
  }
};



  // Handle updating email
  const handleEmailUpdate = async () => {
    if (!newEmail.trim()) {
      alert("Please enter a new email.");
      return;
    }
    if (!current_password) {
      alert("Please confirm your current password.");
      return;
    }
    try {
      await updateUserSettings({ email: newEmail, current_password }, token, logout);
      alert("Email updated successfully");
      setCurrentEmail(newEmail);
      closeChangeDialog();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  // Handle updating password
  const handlePasswordUpdate = async () => {
    if (!current_password) {
      alert("Please confirm your current password.");
      return;
    }
    if (!new_password) {
      alert("Please enter a new password.");
      return;
    }
    if (new_password !== verifyNewPassword) {
      alert("New password and verification do not match.");
      return;
    }
    try {
      await updateUserSettings({ current_password, new_password }, token, logout);
      alert("Password updated successfully");
      closeChangeDialog();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const user = await fetchCurrentUser(token, logout);
        console.log(user)
        setCurrentUsername(user.username);
        setCurrentEmail(user.email);
        setCurrentIcon(user.icon_url);
        setUserIconUrl(user.icon_url ? "http://localhost:8000" + user.icon_url : null); // set the icon URL
      } catch (error) {
        console.error("Failed to fetch user info:", error);
      }
    };
  
    if (open) {
      loadUserInfo();
    }
  }, [open, token, logout]);

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
      const res = await uploadUserIcon(formData, token, logout);
      alert("Icon uploaded successfully!");
      setUserIconUrl("http://localhost:8000" + res.icon_url); // Update displayed icon
      setPreviewUrl(null);          // Clear preview
      setSelectedFile(null);
      console.log(res.icon_url)
      console.log(userIconUrl)
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
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
          User Settings
          <Tooltip title="Close">
            <IconButton
              onClick={onClose}
              sx={{
                color: "#b9bbbe",
                "&:hover": {
                  color: "#fff",
                },
              }}
              size="large"
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        {/* <Divider sx={{ bgcolor: "#444" }} /> */}
        <DialogContent sx={{ bgcolor: "#36393f", color: "white", p: 3 }}>
          <Stack sx={{ pt: 2 }} spacing={2}>
            <div>
              <strong>Username:</strong> {currentUsername || "Not set"}
            </div>
            <Button variant="outlined" onClick={() => openChangeDialog("username")}>
              Change Username
            </Button>

            <div>
              <strong>Email:</strong> {currentEmail || "Not set"}
            </div>
            <Button variant="outlined" onClick={() => openChangeDialog("email")}>
              Change Email
            </Button>

            <Divider sx={{ bgcolor: "#40444b", my: 2 }} />

            <div>
              <strong>Password</strong>
            </div>
            <Button variant="outlined" onClick={() => openChangeDialog("password")}>
              Change Password
            </Button>

            <Divider sx={{ bgcolor: "#40444b", my: 2 }} />

            <strong>Profile Icon</strong>
            {previewUrl ? (
  <img
    src={previewUrl}
    alt="Preview"
    style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
  />
) : userIconUrl && userIconUrl !== "null" ? (
  <img
    src={userIconUrl}
    alt="Profile Icon"
    style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
  />
) : currentIcon ? (
  <img
    src={`http://localhost:8000${currentIcon}`}
    alt="Fallback Icon"
    style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 8 }}
  />
) : (
  <Avatar
    alt={currentUsername}
    sx={{ width: 80, height: 80, bgcolor: "#757575", fontSize: "2rem" }}
  >
    {getFirstLetter(currentUsername)}
  </Avatar>
)}
            <Button variant="outlined" component="label">
              Choose Icon
              <input type="file" hidden accept="image/*" onChange={handleFileChange} />
            </Button>
            <Button
              variant="contained"
              disabled={!selectedFile}
              onClick={handleIconUpload}
            >
              Upload Icon
            </Button>


            <Button variant="outlined" color="error" onClick={logout}>
              Logout
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Change Username Dialog */}
      <Dialog
        open={changeDialogOpen === "username"}
        onClose={closeChangeDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Change Username</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="New Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Confirm Current Password"
              type="password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeChangeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleUsernameUpdate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Email Dialog */}
      <Dialog
        open={changeDialogOpen === "email"}
        onClose={closeChangeDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Change Email</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="New Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Confirm Current Password"
              type="password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeChangeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleEmailUpdate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog
        open={changeDialogOpen === "password"}
        onClose={closeChangeDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Current Password"
              type="password"
              value={current_password}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="New Password"
              type="password"
              value={new_password}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
            />
            <TextField
              label="Verify New Password"
              type="password"
              value={verifyNewPassword}
              onChange={(e) => setVerifyNewPassword(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeChangeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handlePasswordUpdate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default UserSettingsDialog;
