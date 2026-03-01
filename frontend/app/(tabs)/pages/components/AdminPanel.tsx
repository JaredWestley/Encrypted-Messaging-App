import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Spinner, Separator } from "tamagui";
import { TouchableOpacity, Alert as RNAlert, Platform } from "react-native";
import { UserX, Shield, Undo } from "@tamagui/lucide-icons";
import {
  fetchUsersInServer,
  fetchUserRoles,
  kickUser as kickUserApi,
  banUser as banUserApi,
  fetchBannedUsers,
  unbanUser as unbanUserApi,
  fetchRoles
} from "../../../../utils/api";
import { useAuth } from "../../../../utils/AuthContext";

interface Role {
  id: number;
  name: string;
  permissions: string[];
  users: User[];
  is_default?: boolean;
}

interface User {
  id: number;
  username: string;
}

interface AdminPanelProps {
  serverId: number;
  token: string;
  logout: () => void;
  selectedServerOwnerId: number;
}

const AdminPanel: React.FC<AdminPanelProps> = ({
  serverId,
  token,
  logout,
  selectedServerOwnerId,
}) => {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canKick, setCanKick] = useState(false);
  const [canBan, setCanBan] = useState(false);
  const [bannedUsers, setBannedUsers] = useState<User[]>([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [userRolesMap, setUserRolesMap] = useState<{ [userId: number]: number[] }>({});

  const { userId } = useAuth();

  const showToast = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  const kickUser = (targetUserId: number, username: string) => {
    if (targetUserId === userId) {
      showToast("You cannot kick yourself");
      return;
    }

    const doKick = () => {
      kickUserApi(token, serverId, targetUserId, logout)
        .then(() => {
          setMembers((prev) => prev.filter((m) => m.id !== targetUserId));
          showToast(`${username} has been kicked`);
        })
        .catch((err) => setError(`Failed to kick user: ${err.message}`));
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to kick ${username}?`)) {
        doKick();
      }
    } else {
      RNAlert.alert("Kick User", `Are you sure you want to kick ${username}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Kick", style: "destructive", onPress: doKick },
      ]);
    }
  };

  const banUser = (targetUserId: number, username: string) => {
    if (targetUserId === userId) {
      showToast("You cannot ban yourself");
      return;
    }

    const doBan = () => {
      banUserApi(token, serverId, targetUserId, logout)
        .then(() => {
          setMembers((prev) => prev.filter((m) => m.id !== targetUserId));
          showToast(`${username} has been banned`);
        })
        .catch((err) => setError(`Failed to ban user: ${err.message}`));
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to ban ${username}? They will not be able to rejoin until unbanned.`)) {
        doBan();
      }
    } else {
      RNAlert.alert("Ban User", `Are you sure you want to ban ${username}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Ban", style: "destructive", onPress: doBan },
      ]);
    }
  };

  useEffect(() => {
    if (!token || !serverId) return;

    fetchRoles(token, serverId, logout)
      .then((roles) => {
        setAllRoles(roles);
        const userRolesTemp: { [key: number]: number[] } = {};
        roles.forEach((role) => {
          role.users.forEach((u) => {
            if (!userRolesTemp[u.id]) userRolesTemp[u.id] = [];
            userRolesTemp[u.id].push(role.id);
          });
        });
        setUserRolesMap(userRolesTemp);
      })
      .catch((err) => {
        setError(`Failed to load roles: ${err.message}`);
      });
  }, [token, serverId, logout]);

  useEffect(() => {
    if (!serverId || !token) return;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const fetchedMembers = await fetchUsersInServer(token, serverId, logout);
        setMembers(fetchedMembers);
      } catch {
        setError("Unable to load members");
      }

      try {
        const roleData = await fetchUserRoles(token, serverId, userId!, logout);
        const permissions = roleData.flatMap((role: any) => role.permissions || []);
        const isOwner = userId === selectedServerOwnerId;
        setCanKick(isOwner || permissions.includes("KICK_MEMBERS"));
        setCanBan(isOwner || permissions.includes("BAN_MEMBERS"));
      } catch {
        // If can't load permissions, fall back to owner check only
        const isOwner = userId === selectedServerOwnerId;
        setCanKick(isOwner);
        setCanBan(isOwner);
      }

      try {
        const banned = await fetchBannedUsers(token, serverId, logout);
        setBannedUsers(banned);
      } catch {
        setBannedUsers([]);
      }

      setLoading(false);
    };

    loadData();
  }, [serverId, token, logout, userId, selectedServerOwnerId]);

  const unbanUser = (targetUserId: number, username: string) => {
    const doUnban = () => {
      unbanUserApi(token, serverId, targetUserId, logout)
        .then(() => {
          setBannedUsers((prev) => prev.filter((u) => u.id !== targetUserId));
          showToast(`${username} has been unbanned`);
        })
        .catch((err) => setError(`Failed to unban user: ${err.message}`));
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Unban ${username}?`)) {
        doUnban();
      }
    } else {
      RNAlert.alert("Unban User", `Unban ${username}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Unban", onPress: doUnban },
      ]);
    }
  };

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner color="white" size="large" />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack padding="$4">
        <Text color="#f04747">{error}</Text>
      </YStack>
    );
  }

  return (
    <YStack gap="$3">
      <Text fontSize="$6" fontWeight="700" color="white">
        Members ({members.length})
      </Text>

      {members.length === 0 ? (
        <Text color="#72767d" fontSize="$3">No members found</Text>
      ) : (
        <YStack backgroundColor="#202225" borderRadius="$3">
          {members.map((user, index) => {
            const isOwnerUser = user.id === selectedServerOwnerId;
            const isSelf = user.id === userId;
            const kickDisabled = isOwnerUser || isSelf || !canKick;
            const banDisabled = isOwnerUser || isSelf || !canBan;

            const kickTooltip = isSelf
              ? "You cannot kick yourself"
              : isOwnerUser
              ? "Cannot kick the server owner"
              : "Kick member from server";
            const banTooltip = isSelf
              ? "You cannot ban yourself"
              : isOwnerUser
              ? "Cannot ban the server owner"
              : "Ban member from server";

            return (
              <YStack key={user.id}>
                <XStack
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                  pressStyle={{ backgroundColor: "#2f3136" }}
                >
                  <YStack flex={1}>
                    <XStack alignItems="center" gap="$2" marginBottom="$2">
                      <Text color="white" fontSize="$4">
                        {user.username}
                      </Text>
                      {isOwnerUser && (
                        <Text color="#faa61a" fontSize="$2" fontWeight="600">Owner</Text>
                      )}
                      {isSelf && (
                        <Text color="#72767d" fontSize="$2">(You)</Text>
                      )}
                    </XStack>

                    <Text color="#b9bbbe" fontSize="$2">
                      Roles: {userRolesMap[user.id]?.map(roleId =>
                        allRoles.find(r => r.id === roleId)?.name
                      ).join(", ") || "None"}
                    </Text>
                  </YStack>

                  <XStack gap="$2" alignItems="center">
                    <TouchableOpacity
                      onPress={() =>
                        kickDisabled
                          ? showToast(kickTooltip)
                          : kickUser(user.id, user.username)
                      }
                      disabled={kickDisabled}
                      {...(Platform.OS === "web" ? { title: kickTooltip } as any : {})}
                    >
                      <YStack
                        padding="$2"
                        opacity={kickDisabled ? 0.3 : 1}
                        alignItems="center"
                      >
                        <UserX size={20} color={kickDisabled ? "gray" : "#ffb347"} />
                        <Text color={kickDisabled ? "gray" : "#ffb347"} fontSize={10} marginTop={2}>
                          Kick
                        </Text>
                      </YStack>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        banDisabled
                          ? showToast(banTooltip)
                          : banUser(user.id, user.username)
                      }
                      disabled={banDisabled}
                      {...(Platform.OS === "web" ? { title: banTooltip } as any : {})}
                    >
                      <YStack
                        padding="$2"
                        opacity={banDisabled ? 0.3 : 1}
                        alignItems="center"
                      >
                        <Shield size={20} color={banDisabled ? "gray" : "#ff5555"} />
                        <Text color={banDisabled ? "gray" : "#ff5555"} fontSize={10} marginTop={2}>
                          Ban
                        </Text>
                      </YStack>
                    </TouchableOpacity>
                  </XStack>
                </XStack>
                {index < members.length - 1 && <Separator borderColor="#2f3136" />}
              </YStack>
            );
          })}
        </YStack>
      )}

      {bannedUsers.length > 0 && (
        <>
          <Text fontSize="$6" fontWeight="700" color="white" marginTop="$2">
            Banned Members ({bannedUsers.length})
          </Text>

          <YStack backgroundColor="#2b2d31" borderRadius="$3">
            {bannedUsers.map((user, index) => (
              <YStack key={user.id}>
                <XStack
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                  pressStyle={{ backgroundColor: "#393c43" }}
                >
                  <Text color="white" fontSize="$4">
                    {user.username}
                  </Text>
                  <TouchableOpacity onPress={() => unbanUser(user.id, user.username)}>
                    <YStack padding="$2">
                      <Undo size={20} color="#77dd77" />
                    </YStack>
                  </TouchableOpacity>
                </XStack>
                {index < bannedUsers.length - 1 && <Separator borderColor="#393c43" />}
              </YStack>
            ))}
          </YStack>
        </>
      )}

      {/* Snackbar */}
      {snackbarVisible && (
        <YStack
          position="absolute"
          bottom={20}
          alignSelf="center"
          backgroundColor="#323232"
          padding="$3"
          borderRadius="$3"
          enterStyle={{
            opacity: 0,
            y: 20,
          }}
        >
          <Text color="white">{snackbarMessage}</Text>
        </YStack>
      )}
    </YStack>
  );
};

export default AdminPanel;