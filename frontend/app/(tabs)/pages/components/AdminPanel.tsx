import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, ScrollView, Spinner, Select, Separator } from "tamagui";
import { TouchableOpacity, Alert as RNAlert } from "react-native";
import { UserX, Shield, Undo } from "@tamagui/lucide-icons";
import {
  fetchUsersInServer,
  fetchUserRoles,
  kickUser as kickUserApi,
  banUser as banUserApi,
  fetchBannedUsers,
  unbanUser as unbanUserApi,
  fetchRoles,
  assignRole,
  unassignRole,
} from "../../utils/api";
import { useAuth } from "../../utils/AuthContext";

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
    RNAlert.alert("Kick User", `Are you sure you want to kick ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Kick",
        style: "destructive",
        onPress: () => {
          kickUserApi(token, serverId, targetUserId, logout)
            .then(() => {
              setMembers((prev) => prev.filter((m) => m.id !== targetUserId));
              showToast(`${username} has been kicked`);
            })
            .catch((err) => setError(`Failed to kick user: ${err.message}`));
        },
      },
    ]);
  };

  const banUser = (targetUserId: number, username: string) => {
    RNAlert.alert("Ban User", `Are you sure you want to ban ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Ban",
        style: "destructive",
        onPress: () => {
          banUserApi(token, serverId, targetUserId, logout)
            .then(() => {
              setMembers((prev) => prev.filter((m) => m.id !== targetUserId));
              showToast(`${username} has been banned`);
            })
            .catch((err) => setError(`Failed to ban user: ${err.message}`));
        },
      },
    ]);
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

  const handleRoleChange = async (userId: number, roleIds: number[]) => {
    const prevRoles = userRolesMap[userId] || [];
    const toAssign = roleIds.filter((id) => !prevRoles.includes(id));
    const toUnassign = prevRoles.filter((id) => !roleIds.includes(id));

    try {
      await Promise.all([
        ...toAssign.map((roleId) => assignRole(token, serverId, userId, roleId, logout)),
        ...toUnassign.map((roleId) => unassignRole(token, serverId, userId, roleId, logout)),
      ]);

      setUserRolesMap((prev) => ({
        ...prev,
        [userId]: roleIds,
      }));
      showToast("Roles updated");
    } catch (err: any) {
      showToast("Failed to update roles");
    }
  };

  useEffect(() => {
    if (!serverId || !token) return;
    setLoading(true);

    fetchUsersInServer(token, serverId, logout)
      .then((fetchedMembers) => {
        setMembers(fetchedMembers);
        return fetchUserRoles(token, serverId, userId!, logout);
      })
      .then((roleData) => {
        const permissions = roleData.flatMap((role) => role.permissions || []);
        const isOwner = userId === selectedServerOwnerId;
        setCanKick(isOwner || permissions.includes("KICK_MEMBERS"));
        setCanBan(isOwner || permissions.includes("BAN_MEMBERS"));
        return fetchBannedUsers(token, serverId, logout);
      })
      .then((banned) => setBannedUsers(banned))
      .catch(() => setError("Unable to load members or permissions"))
      .finally(() => setLoading(false));
  }, [serverId, token, logout, userId, selectedServerOwnerId]);

  const unbanUser = (targetUserId: number, username: string) => {
    RNAlert.alert("Unban User", `Unban ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unban",
        onPress: () => {
          unbanUserApi(token, serverId, targetUserId, logout)
            .then(() => {
              setBannedUsers((prev) => prev.filter((u) => u.id !== targetUserId));
              showToast(`${username} has been unbanned`);
            })
            .catch((err) => setError(`Failed to unban user: ${err.message}`));
        },
      },
    ]);
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
    <YStack flex={1}>
      <Text fontSize="$6" fontWeight="700" color="white">
        Members ({members.length})
      </Text>

      <ScrollView backgroundColor="#202225" borderRadius="$3" maxHeight={500}>
        <YStack>
          {members.map((user, index) => {
            const isOwner = user.id === selectedServerOwnerId;
            const kickDisabled = isOwner || !canKick;
            const banDisabled = isOwner || !canBan;

            return (
              <YStack key={user.id}>
                <XStack
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                  pressStyle={{ backgroundColor: "#2f3136" }}
                >
                  <YStack flex={1}>
                    <Text color="white" fontSize="$4" marginBottom="$2">
                      {user.username}
                    </Text>
                    
                    {/* Role selector - Note: This is simplified, full implementation would use a custom picker */}
                    <Text color="#b9bbbe" fontSize="$2">
                      Roles: {userRolesMap[user.id]?.map(roleId => 
                        allRoles.find(r => r.id === roleId)?.name
                      ).join(", ") || "None"}
                    </Text>
                  </YStack>

                  <XStack>
                    <TouchableOpacity
                      onPress={() =>
                        kickDisabled
                          ? showToast(
                              isOwner
                                ? "Cannot kick the owner"
                                : "You do not have permission to kick users"
                            )
                          : kickUser(user.id, user.username)
                      }
                      disabled={kickDisabled}
                    >
                      <YStack
                        padding="$2"
                        opacity={kickDisabled ? 0.3 : 1}
                      >
                        <UserX size={20} color={kickDisabled ? "gray" : "#ffb347"} />
                      </YStack>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        banDisabled
                          ? showToast(
                              isOwner
                                ? "Cannot ban the owner"
                                : "You do not have permission to ban users"
                            )
                          : banUser(user.id, user.username)
                      }
                      disabled={banDisabled}
                    >
                      <YStack
                        padding="$2"
                        opacity={banDisabled ? 0.3 : 1}
                      >
                        <Shield size={20} color={banDisabled ? "gray" : "#ff5555"} />
                      </YStack>
                    </TouchableOpacity>
                  </XStack>
                </XStack>
                {index < members.length - 1 && <Separator borderColor="#2f3136" />}
              </YStack>
            );
          })}
        </YStack>
      </ScrollView>

      {bannedUsers.length > 0 && (
        <>
          <Text fontSize="$6" fontWeight="700" color="white" marginTop="$4">
            Banned Members ({bannedUsers.length})
          </Text>

          <ScrollView backgroundColor="#2b2d31" borderRadius="$3" maxHeight={300}>
            <YStack>
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
          </ScrollView>
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