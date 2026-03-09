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
- [📡 API Overview](#-api-overview)
- [🧪 Development Requirements](#-development-requirements)

---

## 📸 Images
### Login Page
<img width="2703" height="1523" alt="image" src="https://github.com/user-attachments/assets/d7e4bba7-dd40-4e5a-9246-f0ada1081b06" />


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
