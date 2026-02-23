# 🔐 Encrypted Messaging App

A privacy-focused, end-to-end encrypted (E2EE) real-time messaging application for web and Mobile supporting text messaging, group communication, media sharing, and peer-to-peer voice/video calls.

This project was developed as my final year project in university exploring secure, accessible and scalable communication systems.

---

## 📑 Table of Contents

- [🚀 Features](#-features)
- [🏗️ Architecture Overview](#️-architecture-overview)
- [📂 Project Structure](#-project-structure)
- [🖥️ Running the Project Locally](#️-running-the-project-locally)
  - [Run the Frontend](#1️⃣-run-the-frontend)
  - [Run the Backend](#2️⃣-run-the-backend)
- [📡 API Overview](#-api-overview)
- [🧪 Development Requirements](#-development-requirements)

---

## 🚀 Features

- 🔒 End-to-End Encrypted Messaging (E2EE)
- 💬 Real-time messaging using WebSockets
- 👥 Group chats with role-based permissions
- 📁 Encrypted file and image sharing
- 📞 Peer-to-peer voice and video calls (WebRTC)
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
