import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Paper,
  Alert,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Snackbar,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ServerSidebar from "./components/ServerSidebar";
import RightSidebar from "./components/RightSidebar";
import SettingsDialog from "./components/SettingsDialog";
import UserProfileDialog from "./components/UserProfileDialog";
import { apiRequest, deleteMessage, updateMessage, sendMessage, joinServerWithInvite } from "../api";
import { useAuth } from "../context/AuthContext";


const API_URL = "http://localhost:8000/api";

interface Message {
  id: number;
  username: string;
  content: string;
  user_id: number;
  timestamp: string;
}

interface Server {
  id: number;
  name: string;
  owner_id?: number;
  icon_url?: string;
}

interface User {
  id: number;
  username: string;
}

const ChatPage: React.FC = () => {
  const { token, username, userId, logout } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [didLeaveServer, setDidLeaveServer] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("info");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const { inviteCode } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
  const joinServerFromUrl = async () => {
    if (!token || !inviteCode) return;

    try {
      await joinServerWithInvite(token, inviteCode, logout);
      const updatedServers = await apiRequest<Server[]>(
        `${API_URL}/servers`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout
      );

      const newlyJoinedServer = updatedServers.find(
        (s) => !servers.some((prev) => prev.id === s.id)
      );

      if (newlyJoinedServer) {
        setSelectedServer(newlyJoinedServer);
      } else if (updatedServers.length > 0) {
        setSelectedServer(updatedServers[0]);
      }

      setServers(updatedServers);
      showSnackbar("Successfully joined the server!", "success");

      // ✅ Redirect away to stop re-triggering the join
      navigate("/chat", { replace: true });
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

  joinServerFromUrl();
  // remove `servers` from dependency array to prevent looping
}, [inviteCode, token, logout, navigate]);


  const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "info") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };


  useEffect(() => {
    if (!token) return;
    apiRequest<Server[]>(`${API_URL}/servers`, { headers: { Authorization: `Bearer ${token}` } }, logout)
      .then((data) => setServers(data))
      .catch(() => setError("Failed to load servers"));
  }, [token, didLeaveServer]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
  
    const threshold = 100;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsAtBottom(atBottom);
    setShowScrollToBottom(!atBottom);
  }, [messages]);
  

  const prevMessages = useRef<Message[]>([]);

  useEffect(() => {
    const prevMsgs = prevMessages.current;
    const messagesIncreased = messages.length > prevMsgs.length;
    const messagesChanged = JSON.stringify(messages) !== JSON.stringify(prevMsgs);
  
    if ((isAtBottom && messagesIncreased) || messagesChanged) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessages.current = messages;
  }, [messages, isAtBottom]);
  

  useEffect(() => {
    if (didLeaveServer && token) {
      apiRequest<Server[]>(`${API_URL}/servers`, { headers: { Authorization: `Bearer ${token}` } }, logout)
        .then((data) => {
          setServers(data);

          setSelectedServer(null);
          setDidLeaveServer(false);
        })
        .catch(() => {
          setError("Failed to refresh servers after leaving");
          setDidLeaveServer(false);
        });
    }
  }, [didLeaveServer, token, logout]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, messageId: number) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuMessageId(messageId);
  };
  
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuMessageId(null);
  };
  
  const handleEditClick = (id: number, content: string) => {
    setEditingMessageId(id);
    setEditContent(content);
    handleMenuClose();
  };
  
  const handleDeleteClick = (id: number) => {
    handleDelete(id);
    handleMenuClose();
  };

  const loadMessages = async () => {
    if (!token || !selectedServer) return;
    try {
      const data = await apiRequest<Message[]>(
        `${API_URL}/messages?server_id=${selectedServer.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        logout
      );
      setMessages(data);
    } catch {
      setError("Failed to load messages");
    }
  };

  useEffect(() => {
    if (!token || !selectedServer) return;
    loadMessages();
    const intervalId = setInterval(loadMessages, 3000);
    return () => clearInterval(intervalId);
  }, [token, selectedServer]);

  const handleSend = async () => {
    console.log(!input.trim(), !token, !selectedServer)
    if (!input.trim() || !token || !selectedServer) return;
    setError(null);
    console.log("handleSend triggered"); 
    try {
      await sendMessage(token, input.trim(), selectedServer.id, userId!, logout);
      await loadMessages();
      setInput("");
    } catch (err: any) {
      if (err.message.includes("429")) {
        setError("You're sending messages too quickly. Please wait a moment."); // 🔔 Snackbar-friendly message
      } else {
        setError("Failed to send message");
      }
    }
  };
  
  

  const handleEditSave = async (id: number) => {
    if (!token || !selectedServer) return;
    try {
      await updateMessage(token, id, editContent, logout);
      await loadMessages();
      setEditingMessageId(null);
    } catch {
      setError("Failed to update message");
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !selectedServer) return;
    try {
      await deleteMessage(token, selectedServer.id, id, logout);
      await loadMessages();
    } catch {
      showSnackbar("Failed to delete message");
    }
  };

  const handleUserEdit = (user: User) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleString(undefined, {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };


  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAtBottom]);
  

  useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".message-item")) {
      setMenuAnchorEl(null);
      setMenuMessageId(null);
      // Delay to let edit action complete
      setTimeout(() => setEditingMessageId(null), 50);
    }
  };
  document.addEventListener("click", handleClickOutside);
  return () => document.removeEventListener("click", handleClickOutside);
}, []);

  if (!token) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="text.secondary">You must be logged in to view this page.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        bgcolor: "#2f3136",
        color: "#dcddde",
        m: 0,
        p: 0,
        width: "100%",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      {/* Left Sidebar - Servers */}
      <ServerSidebar
        servers={servers}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
        setServers={setServers}
        token={token}
        setError={setError}
      />

      {/* Center Chat Panel */}
      {selectedServer ? (
        <>
          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              bgcolor: "#36393f",
              height: "100%",
            }}
          >
            {/* Header */}
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
              <Typography
                variant="h5"
                noWrap
                sx={{
                  fontWeight: 600,
                  color: "#fff",
                  userSelect: "none",
                }}
              >
                {selectedServer.name}
              </Typography>

              <Button
                startIcon={<SettingsIcon />}
                variant="outlined"
                sx={{
                  color: "#5865F2",
                  borderColor: "#5865F2",
                  textTransform: "none",
                  fontWeight: 600,
                  "&:hover": {
                    bgcolor: "rgba(88,101,242,0.1)",
                    borderColor: "#5865F2",
                  },
                }}
                onClick={() => setIsServerSettingsOpen(true)}
              >
                Server Settings
              </Button>
            </Box>

            {/* Messages List */}
            <Paper
              ref={chatContainerRef}
              elevation={0}
              sx={{
                flexGrow: 1,
                position: "relative",
                bgcolor: "#2c2f33",
                p: 3,
                overflowY: "auto",
                scrollbarWidth: "thin",
                scrollbarColor: "#202225 transparent",
                "&::-webkit-scrollbar": { width: 8 },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: "#202225",
                  borderRadius: 4,
                },
              }}
            >
              {error && (
                <Alert severity="error" sx={{ mb: 2, fontWeight: 600 }}>
                  {error}
                </Alert>
              )}
              <List disablePadding>
                {messages.map((msg) => (
                  <ListItem
                    key={msg.id}
                    className="message-item"
                    // onClick={() => setMenuMessageId(menuMessageId === msg.id ? null : msg.id)}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      bgcolor:
                        editingMessageId === msg.id
                          ? "#40444b"
                          : hoveredMessageId === msg.id
                          ? "#3a3c43"
                          : "transparent",
                      borderRadius: 2,
                      mb: 1,
                      px: 2,
                      py: 1.25,
                      cursor: "pointer",
                      userSelect: "none",
                      transition: "background-color 0.15s ease-in-out",
                      boxShadow:
                        hoveredMessageId === msg.id ? "0 0 8px rgba(88,101,242,0.3)" : "none",
                    }}
                  >
                    {editingMessageId === msg.id ? (
                      <TextField
                        size="small"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault(); // Prevent newline
                            handleEditSave(msg.id);
                          } else if (e.key === "Escape") {
                            setEditingMessageId(null);
                          }
                        }}
                        sx={{
                          flexGrow: 1,
                          mr: 2,
                          bgcolor: "#40444b",
                          borderRadius: 2,
                          "& .MuiInputBase-input": {
                            color: "#dcddde",
                            padding: "10px 12px",
                          },
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "transparent",
                          },
                          "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#5865F2",
                          },
                          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#5865F2",
                          },
                        }}
                        autoFocus
                        multiline
                        maxRows={4}
                        fullWidth
                        placeholder="Edit your message"
                      />
                    ) : (
                      <>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" gap={1}>
                              <Typography
                                component="span"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent triggering other click events
                                  handleUserEdit({ id: msg.user_id, username: msg.username });
                                }}
                                sx={{
                                  fontWeight: 700,
                                  // color: "#00AFF4",
                                  userSelect: "text",
                                  cursor: "pointer",
                                  "&:hover": {
                                    textDecoration: "underline",
                                  },
                                }}
                              >
                                {msg.username}
                              </Typography>
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: "0.75rem",
                                  color: "#b9bbbe",
                                  userSelect: "text",
                                }}
                              >
                                {formatTimestamp(msg.timestamp)}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography
                              component="span"
                              sx={{
                                display: "block",
                                whiteSpace: "pre-wrap",
                                color: "#dcddde",
                                mt: 0.25,
                                fontSize: "0.95rem",
                                userSelect: "text",
                              }}
                            >
                              {msg.content}
                            </Typography>
                          }
                          sx={{ flexGrow: 1, mr: 1 }}
                        />


                        {hoveredMessageId === msg.id && (
                          <>
                            <Tooltip title="More options" arrow>
                              <IconButton
                                aria-label="more"
                                size="small"
                                sx={{ color: "#b9bbbe" }}
                                onClick={(e) => handleMenuOpen(e, msg.id)}
                              >
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Menu
                              anchorEl={menuAnchorEl}
                              open={menuMessageId === msg.id}
                              onClose={handleMenuClose}
                              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                              transformOrigin={{ vertical: "top", horizontal: "right" }}
                              PaperProps={{
                                sx: { bgcolor: "#2f3136", color: "#dcddde" },
                              }}
                            >
                              {msg.user_id === userId && (
                                <MenuItem
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent the outside click listener
                                    handleEditClick(msg.id, msg.content);
                                  }}
                                  sx={{ "&:hover": { bgcolor: "#5865F2" } }}
                                >
                                  <EditIcon fontSize="small" sx={{ mr: 1 }} />
                                  Edit
                                </MenuItem>
                              )}
                              <MenuItem
                                onClick={() => handleDeleteClick(msg.id)}
                                sx={{ color: "#f04747", "&:hover": { bgcolor: "#f0474740" } }}
                              >
                                <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                                Delete
                              </MenuItem>
                            </Menu>
                          </>
                        )}
                      </>
                    )}
                  </ListItem>
                ))}
                <div ref={messagesEndRef} />
              </List>
            </Paper>
            {showScrollToBottom && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: 16,
                  right: 16,
                  zIndex: 10,
                  bgcolor: "#5865F2",
                  color: "#fff",
                  px: 2,
                  py: 1,
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  "&:hover": { bgcolor: "#4752c4" },
                }}
                onClick={() => {
                  chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: "smooth" });
                  setIsAtBottom(true);
                  setShowScrollToBottom(false);
                }}                
              >
                Scroll to bottom
              </Box>
            )}

            {/* Input Box */}
            <Box
              sx={{
                p: 2,
                borderTop: "1px solid #202225",
                backgroundColor: "#2f3136",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <TextField
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                multiline
                maxRows={4}
                fullWidth
                sx={{
                  bgcolor: "#40444b",
                  borderRadius: 2,
                  "& .MuiInputBase-input": {
                    color: "#dcddde",
                    padding: "10px 12px",
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "transparent",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#5865F2",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#5865F2",
                  },
                }}
              />

              <Button
                variant="contained"
                onClick={handleSend}
                disabled={!input.trim()}
                sx={{
                  bgcolor: "#5865F2",
                  color: "#fff",
                  textTransform: "none",
                  fontWeight: 700,
                  px: 4,
                  height: 40,
                  "&:hover": {
                    bgcolor: "#4752c4",
                  },
                }}
              >
                Send
              </Button>
            </Box>
          </Box>

          {/* Right Sidebar */}
          <RightSidebar
            serverId={selectedServer.id}
            token={token}
            onEditUser={handleUserEdit}
          />

          {/* Server Settings Dialog */}
          {isServerSettingsOpen && selectedServer && (
            <SettingsDialog
              open={isServerSettingsOpen}
              onClose={() => setIsServerSettingsOpen(false)}
              serverName={selectedServer?.name}
              serverId={selectedServer?.id ?? 0}
              token={token}
              logout={logout}
              isOwner={selectedServer?.owner_id === userId}
              selectedServerOwnerId={selectedServer?.owner_id ?? 1}
              servers={servers}
              selectedServer={selectedServer}
              setSelectedServer={setSelectedServer}
              setServers={setServers}
              onLeaveServer={() => {
                setIsServerSettingsOpen(false);
                // optionally refresh servers list or redirect
                setDidLeaveServer(true);
              }}
            />
          )}

          {/* User Profile Dialog */}
          {selectedUser && (
            <UserProfileDialog
              open={isUserDialogOpen}
              onClose={() => setIsUserDialogOpen(false)}
              user={selectedUser}
              serverId={selectedServer.id}
            />
          )}
        </>
      ) : (
        <Box
          sx={{
            flexGrow: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            bgcolor: "#36393f",
            color: "#72767d",
            fontSize: "1.2rem",
            fontWeight: 600,
          }}
        >
          Select a server to start chatting
        </Box>
      )}
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
    </Box>
  );
};

export default ChatPage;
