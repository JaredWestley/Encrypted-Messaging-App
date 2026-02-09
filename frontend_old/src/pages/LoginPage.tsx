import React, { useState } from "react";
import {
  TextField,
  Button,
  Container,
  Typography,
  Alert,
  Paper,
  InputAdornment,
  IconButton,
  Fade,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { loginUser } from "../api";
import { useAuth } from "../context/AuthContext";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await loginUser(username.trim(), password);
      login(data.access_token, data.username, data.userId);
      navigate("/chat");
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((show) => !show);
  };

  return (
    <Container
      maxWidth="xs"
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#36393f",
        px: 2,
      }}
    >
      <Fade in timeout={600}>
        <Paper
          elevation={8}
          sx={{
            p: 5,
            width: "100%",
            borderRadius: 3,
            bgcolor: "#2f3136",
            boxShadow:
              "0 8px 24px rgba(0, 0, 0, 0.75), 0 0 2px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
          role="main"
          aria-label="Login form"
        >
          <Typography
            variant="h4"
            fontWeight={700}
            align="center"
            color="white"
            gutterBottom
            sx={{ userSelect: "none" }}
          >
            Welcome Back
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{
                bgcolor: "#f44336",
                color: "white",
                fontWeight: 600,
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
              role="alert"
            >
              {error}
            </Alert>
          )}

          <TextField
            label="Username"
            variant="filled"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            autoFocus
            onKeyDown={onKeyDown}
            autoComplete="username"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon sx={{ color: "#5865F2" }} />
                </InputAdornment>
              ),
              sx: {
                bgcolor: "#202225",
                borderRadius: 1,
                color: "white",
                "& input": { color: "white" },
                "& .MuiInputLabel-root": { color: "#b9bbbe" },
                "&:hover .MuiInputLabel-root": { color: "#5865F2" },
                "&.Mui-focused .MuiInputLabel-root": { color: "#5865F2" },
                transition: "background-color 0.3s ease",
              },
            }}
          />

          <TextField
            label="Password"
            variant="filled"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            onKeyDown={onKeyDown}
            autoComplete="current-password"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon sx={{ color: "#5865F2" }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={togglePasswordVisibility}
                    edge="end"
                    sx={{ color: "#5865F2" }}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                bgcolor: "#202225",
                borderRadius: 1,
                color: "white",
                "& input": { color: "white" },
                "& .MuiInputLabel-root": { color: "#b9bbbe" },
                "&:hover .MuiInputLabel-root": { color: "#5865F2" },
                "&.Mui-focused .MuiInputLabel-root": { color: "#5865F2" },
                transition: "background-color 0.3s ease",
              },
            }}
          />

          <Button
            variant="contained"
            onClick={handleLogin}
            fullWidth
            size="large"
            disabled={loading}
            sx={{
              bgcolor: "#5865F2",
              fontWeight: 700,
              textTransform: "none",
              boxShadow:
                "0 4px 14px rgba(88, 101, 242, 0.4), 0 2px 10px rgba(88, 101, 242, 0.3)",
              transition: "background-color 0.3s ease",
              "&:hover": {
                bgcolor: "#4752c4",
                boxShadow:
                  "0 6px 20px rgba(71, 82, 196, 0.6), 0 3px 14px rgba(71, 82, 196, 0.4)",
              },
              "&:disabled": {
                bgcolor: "#5865F2",
                opacity: 0.6,
                boxShadow: "none",
                cursor: "not-allowed",
              },
            }}
            aria-label="Login button"
          >
            {loading ? "Logging in..." : "Login"}
          </Button>

          <Typography
            align="center"
            color="#b9bbbe"
            sx={{ userSelect: "none", fontSize: "0.9rem" }}
          >
            Don't have an account?{" "}
            <RouterLink
              to="/register"
              style={{
                color: "#5865F2",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Register
            </RouterLink>
          </Typography>
        </Paper>
      </Fade>
    </Container>
  );
};

export default LoginPage;
