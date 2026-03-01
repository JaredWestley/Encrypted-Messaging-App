from fastapi import WebSocket
from typing import Dict, Set, Optional


class ConnectionManager:
    #Manages WebSocket connections per server and per user (for DMs).

    def __init__(self):
        # server_id -> set of (user_id, websocket) tuples
        self.active_connections: Dict[int, Set[tuple]] = {}
        # user_id -> set of server_ids they're connected to
        self.user_servers: Dict[int, Set[int]] = {}
        # user_id -> set of websocket connections (for DM notifications)
        self.user_connections: Dict[int, Set[WebSocket]] = {}
        # Voice channels: channel_id -> set of user_ids currently connected
        self.voice_channel_users: Dict[int, Set[int]] = {}
        # Reverse map: user_id -> channel_id (a user can only be in one voice channel)
        self.user_voice_channel: Dict[int, int] = {}

    async def connect(self, websocket: WebSocket, server_id: int, user_id: int):
        #Register an already-accepted WebSocket connection.
        if server_id not in self.active_connections:
            self.active_connections[server_id] = set()
        self.active_connections[server_id].add((user_id, websocket))

        if user_id not in self.user_servers:
            self.user_servers[user_id] = set()
        self.user_servers[user_id].add(server_id)

        # Also track per-user connections for DM delivery
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, server_id: int, user_id: int):
        if server_id in self.active_connections:
            self.active_connections[server_id].discard((user_id, websocket))
            if not self.active_connections[server_id]:
                del self.active_connections[server_id]

        if user_id in self.user_servers:
            self.user_servers[user_id].discard(server_id)
            if not self.user_servers[user_id]:
                del self.user_servers[user_id]

        # Remove from per-user connections
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

    async def connect_dm(self, websocket: WebSocket, user_id: int):
        #Register a DM WebSocket connection (not tied to a server).
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)

    def disconnect_dm(self, websocket: WebSocket, user_id: int):
        #Remove a DM WebSocket connection.
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

    async def broadcast_to_server(self, server_id: int, message: dict, exclude_user_id: int | None = None):
        #Broadcast a message to all connections in a server, optionally excluding a user.
        if server_id not in self.active_connections:
            return
        disconnected = []
        for user_id, ws in list(self.active_connections[server_id]):
            if exclude_user_id and user_id == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append((user_id, ws))
        for conn in disconnected:
            self.active_connections[server_id].discard(conn)

    async def send_to_user_in_server(self, server_id: int, user_id: int, message: dict):
        #Send a message to a specific user in a specific server.
        if server_id not in self.active_connections:
            return
        for uid, ws in list(self.active_connections[server_id]):
            if uid == user_id:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def send_to_user(self, user_id: int, message: dict):
        #Send a message to a user on ALL their connections (for DMs, friend requests, etc.).
        if user_id not in self.user_connections:
            return
        disconnected = []
        for ws in list(self.user_connections[user_id]):
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.user_connections[user_id].discard(ws)

    def get_connected_user_ids(self, server_id: int) -> set:
        #Get all user IDs connected to a server.
        if server_id not in self.active_connections:
            return set()
        return {user_id for user_id, _ in self.active_connections[server_id]}

    # ─── Voice Channel Management ────────────────────────────────

    def join_voice_channel(self, channel_id: int, user_id: int) -> Optional[int]:
        #Track a user joining a voice channel. Returns the old channel_id if they were in one.
        old_channel = self.user_voice_channel.get(user_id)
        if old_channel is not None:
            self.leave_voice_channel(old_channel, user_id)

        if channel_id not in self.voice_channel_users:
            self.voice_channel_users[channel_id] = set()
        self.voice_channel_users[channel_id].add(user_id)
        self.user_voice_channel[user_id] = channel_id
        return old_channel

    def leave_voice_channel(self, channel_id: int, user_id: int):
        #Track a user leaving a voice channel.
        if channel_id in self.voice_channel_users:
            self.voice_channel_users[channel_id].discard(user_id)
            if not self.voice_channel_users[channel_id]:
                del self.voice_channel_users[channel_id]
        self.user_voice_channel.pop(user_id, None)

    def get_voice_channel_users(self, channel_id: int) -> Set[int]:
        #Get all user IDs in a voice channel.
        return self.voice_channel_users.get(channel_id, set())

    def get_user_voice_channel(self, user_id: int) -> Optional[int]:
        #Get the voice channel a user is currently in, if any.
        return self.user_voice_channel.get(user_id)

    def leave_all_voice_channels(self, user_id: int) -> Optional[int]:
        #Remove user from any voice channel they're in. Returns the channel_id or None.
        channel_id = self.user_voice_channel.pop(user_id, None)
        if channel_id is not None and channel_id in self.voice_channel_users:
            self.voice_channel_users[channel_id].discard(user_id)
            if not self.voice_channel_users[channel_id]:
                del self.voice_channel_users[channel_id]
        return channel_id


manager = ConnectionManager()
