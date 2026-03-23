<div align="center">
  
# 🔐 Encrypted Messaging App

### Secure messaging app with collaborative features and Mobile/Web support.

![Platform](https://img.shields.io/badge/Platform-React%20Native-blue)
![Backend](https://img.shields.io/badge/Backend-Python-green)
![License](https://img.shields.io/badge/License-MIT-yellow)
</div>

---

## 📖 Overview

**Encrypted Messaging App** is a privacy-focused, end-to-end encrypted (E2EE) real-time messaging application for web and Mobile supporting text messaging, group communication, media sharing, and peer-to-peer voice/video calls.

This project was developed as my final year project in university exploring secure, accessible and scalable communication systems.

The application consists of:

- 📱 A React Native (Expo) front-end for web and mobile support.
- 🧠 A Python-based back-end.
- 🤖 AI-integrated trading logic.

---

## 📑 Table of Contents

- [📸 Images](#-images)
- [🚀 Features](#-features)
- [🏗️ Architecture Overview](#️-architecture-overview)
- [📂 Project Structure](#-project-structure)
- [🖥️ Running the Project Locally](#️-running-the-project-locally)
  - [Run the Frontend](#1️⃣-run-the-frontend)
  - [Run the Backend](#2️⃣-run-the-backend)
- [🐳 Running with Docker](#-running-with-docker)
  - [Prerequisites — Install Docker](#prerequisites--install-docker)
  - [Running the App](#-running-the-app)
  - [Useful Docker Commands](#-useful-docker-commands)
  - [Troubleshooting](#️-troubleshooting)
- [📡 API Overview](#-api-overview)
- [🧪 Development Requirements](#-development-requirements)

---

## 📸 Images
### Login Page
<img width="2704" height="1536" alt="image" src="https://github.com/user-attachments/assets/abbf6d06-beec-4b00-b36e-3087ecff0652" />

### Server Chat Page
<img width="2704" height="1532" alt="image" src="https://github.com/user-attachments/assets/2234c0e6-c8fd-472b-a48a-904cd2c719d6" />

### Add Friends
<img width="2701" height="1526" alt="image" src="https://github.com/user-attachments/assets/1d65cf13-1f17-486b-9541-fbd6ef9b0904" />

<img width="601" height="773" alt="image" src="https://github.com/user-attachments/assets/1aa37536-8352-4235-9360-7bb0ec12ffac" />

### Server Settings Page
<img width="2704" height="1527" alt="image" src="https://github.com/user-attachments/assets/02d40749-42e8-479f-8c09-76136c28ebd9" />

### Voice and Voice Calling
<img width="2704" height="1524" alt="image" src="https://github.com/user-attachments/assets/82cc6a17-da67-4cd1-bc17-d829efa9662f" />

<img width="445" height="525" alt="image" src="https://github.com/user-attachments/assets/ee261b00-f11f-46b9-b681-66996747b23b" />

Blanked for privacy :)
<img width="2704" height="1534" alt="image" src="https://github.com/user-attachments/assets/e24eae3c-6373-494d-83f5-534967f131ab" />


### Collaborative Document and Whiteboard editing
<img width="2704" height="1530" alt="image" src="https://github.com/user-attachments/assets/ec62b775-b240-479b-a79a-449082482579" />

<img width="2704" height="1530" alt="image" src="https://github.com/user-attachments/assets/3c328d92-c20f-4416-abca-d7a6719aeac5" />


---

## 🚀 Features

- 🔒 End-to-End Encrypted Messaging (E2EE)
- 💬 Real-time messaging using WebSockets
- 👥 Group chats with role-based permissions
- 📁 Encrypted file and image sharing
- 📞 Peer-to-peer voice and video calls (WebRTC)
- 📄 Real-time collaborative document editing
- 🌐 Cross-platform support (Web + Mobile-ready architecture)
- 🔑 JWT-based authentication & secure session handling
- 🏠 Optional self-hosting support

---

## 🏗️ Architecture Overview

The system follows a modular **Client → Server → Database** architecture:

- **Frontend**: React Native + Expo
- **Backend**: Python (FastAPI + Socket.IO)
- **Database**: SQLite
- **Encryption**: Client-side public/private key cryptography
- **Real-time Communication**: WebSockets + WebRTC

All encryption occurs client-side. The backend only routes encrypted payloads and stores minimal metadata.

---

## 📂 Project Structure
- /frontend → React frontend application
- /backend → Python FastAPI backend

---

# 🖥️ Running the Project Locally

## 1️⃣ Run the Frontend

Navigate to the frontend directory:

```bash
cd frontend

npm install

npm run dev
```

## 2️⃣ Run the Backend

Navigate to the frontend directory:

```bash
cd backend

python -m venv venv
```

### Activate the virtual environment:
#### On MacOS/Linux
```bash
source venv/bin/activate
```

#### On Windows
```bash
venv\Scripts\activate
```

### Then Install the requiements and run the backend.
```bash
pip install -r requirements.txt

#Local Only
uvicorn main:app --reload

#Or if you want other devices to be able to communicate with the backend.
uvicorn main:app --reload --host 0.0.0.0
```

---

# 🐳 Running with Docker

Docker lets you run the entire app (frontend + backend) in isolated containers with a single command — no need to install Node.js, Python, or any dependencies manually.

## Prerequisites — Install Docker

You only need **one thing installed**: Docker Desktop (which includes both `docker` and `docker compose`).

### 🍎 macOS

1. Go to [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
2. Click **Download for Mac** (choose **Apple Silicon** if you have an M1/M2/M3/M4 Mac, or **Intel** for older Macs)
   - Not sure which? Click the Apple logo top-left → **About This Mac** → look for "Apple M..." or "Intel"
3. Open the downloaded `.dmg` file
4. Drag **Docker** into **Applications**
5. Open **Docker Desktop** from Applications — it will ask for your password to finish setup
6. Wait until the Docker icon in the menu bar shows a steady state (not animating)
7. Open **Terminal** and verify it works:
   ```bash
   docker --version
   docker compose version
   ```
   You should see version numbers for both. If you get "command not found", restart your terminal.

### 🪟 Windows

1. **Enable WSL 2** (Windows Subsystem for Linux) — Docker needs this:
   - Open **PowerShell as Administrator** (right-click Start → "Terminal (Admin)" or "PowerShell (Admin)")
   - Run:
     ```powershell
     wsl --install
     ```
   - **Restart your computer** when prompted
   - After reboot, a Ubuntu window may open asking you to create a username/password — do so (this is just for WSL, pick anything)
2. Go to [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
3. Click **Download for Windows**
4. Run the installer (`.exe` file) — keep all defaults, make sure **"Use WSL 2"** is checked
5. **Restart your computer** if prompted
6. Open **Docker Desktop** — let it finish starting up (the whale icon in the system tray should stop animating)
7. Open **Command Prompt** or **PowerShell** and verify:
   ```powershell
   docker --version
   docker compose version
   ```
   Both should return version numbers. If not, restart your terminal or PC.

### 🐧 Linux (Ubuntu/Debian)

1. Open a terminal and run these commands one by one:
   ```bash
   # Update your package list
   sudo apt update

   # Install prerequisites
   sudo apt install -y ca-certificates curl gnupg

   # Add Docker's official GPG key
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   sudo chmod a+r /etc/apt/keyrings/docker.gpg

   # Add Docker's repository
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
     sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

   # Install Docker Engine + Compose
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. Allow your user to run Docker without `sudo`:
   ```bash
   sudo usermod -aG docker $USER
   ```
   **Log out and log back in** (or restart) for this to take effect.

3. Verify installation:
   ```bash
   docker --version
   docker compose version
   ```

> **Fedora/Arch/other distros:** See the [official Docker docs](https://docs.docker.com/engine/install/) for your specific distro.

---

## 🚀 Running the App

1. **Clone the repository** (or download and extract the ZIP):
   ```bash
   git clone https://github.com/YOUR_USERNAME/Encrypted-Messaging-App.git
   cd Encrypted-Messaging-App
   ```

2. **(Optional) Create a `.env` file** in the project root to customise settings:
   ```bash
   # .env (create this file next to docker-compose.yml)
   SECRET_KEY=your-secret-key-here
   MINIMAX_API_KEY=your-api-key-here
   FRONTEND_PORT=3000
   BACKEND_PORT=8000
   ```
   If you skip this step, defaults will be used (which is fine for local testing).

3. **Build and start** both containers:
   ```bash
   docker compose up --build
   ```
   The first build takes a few minutes (downloading base images and installing dependencies). Subsequent starts are much faster.

4. **Open the app** in your browser:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)

5. **Stop the app** by pressing `Ctrl + C` in the terminal, or run:
   ```bash
   docker compose down
   ```

## 🔧 Useful Docker Commands

| Command | What It Does |
|---|---|
| `docker compose up --build` | Build images and start the app |
| `docker compose up -d` | Start in the background (detached) |
| `docker compose down` | Stop and remove containers |
| `docker compose logs -f` | View live logs from both services |
| `docker compose logs backend` | View only backend logs |
| `docker compose ps` | Check which containers are running |
| `docker compose down -v` | Stop and **delete all data** (database, uploads) |

## ⚠️ Troubleshooting

| Problem | Solution |
|---|---|
| "docker: command not found" | Make sure Docker Desktop is installed and running. Restart your terminal. |
| "permission denied" on Linux | Run `sudo usermod -aG docker $USER` then **log out and back in**. |
| Port 3000 or 8000 already in use | Change the ports in your `.env` file: `FRONTEND_PORT=3001` |
| Containers exit immediately | Check logs with `docker compose logs` for error details. |
| "WSL 2 is not installed" on Windows | Run `wsl --install` in PowerShell as Admin, then restart. |
| Changes not showing after code edit | Run `docker compose up --build` to rebuild with your changes. |

---

## 📡 API Overview

### Authentication

- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout

### Messaging (WebSocket)
- /ws/chat

### Conversations
- GET /api/conversations
- POST /api/conversations

### Media
- POST /api/media/upload

---

## 🧪 Development Requirements

- Node.js v20.9+
- Python 3.10+
- npm
- pip

Run frontend and backend in separate terminals.
