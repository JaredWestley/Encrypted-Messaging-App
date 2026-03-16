import React, { useState, useEffect, useRef } from "react";
import { YStack, XStack, Text, Input, Button, ScrollView, Spinner, Separator } from "tamagui";
import { TouchableOpacity, Alert as RNAlert, useWindowDimensions, Platform } from "react-native";
import { Trash2, ChevronLeft, Check } from "@tamagui/lucide-icons";
import {
  fetchRoles,
  createRole as apiCreateRole,
  updateRole as apiUpdateRole,
  deleteRole as apiDeleteRole,
  fetchUsersInServer,
  fetchPermissions,
  assignRole,
  unassignRole,
} from "../../../../utils/api";
import { usePreferences } from "../../../../utils/PreferencesContext";

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_CHANNEL: "View Channel",
  SEND_MESSAGES: "Send Messages",
  MANAGE_ROLES: "Manage Roles",
  MANAGE_SERVER: "Manage Server",
  MANAGE_CHANNELS: "Manage Channels",
  KICK_MEMBERS: "Kick Members",
  BAN_MEMBERS: "Ban Members",
  DELETE_MESSAGES: "Delete Messages",
  SEND_REACTIONS: "Send Reactions",
  USE_AI_SUMMARY: "Use AI Summary",
};

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

interface RolesSettingsProps {
  serverId: number;
  token: string;
  logout: () => void;
}

const RolesSettings: React.FC<RolesSettingsProps> = ({ serverId, token, logout }) => {
  const { fontSizeValue, fontFamily } = usePreferences();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const originalUserIdsRef = useRef<number[]>([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const showToast = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [rolesData, usersData, permissionsData] = await Promise.all([
          fetchRoles(token, serverId, logout),
          fetchUsersInServer(token, serverId, logout),
          fetchPermissions(token, logout),
        ]);

        setRoles(rolesData);
        setUsers(usersData);
        setAvailablePermissions(permissionsData);
        if (rolesData.length > 0 && !selectedRoleId) {
          setSelectedRoleId(rolesData[0].id);
        }
      } catch (error: any) {
        RNAlert.alert("Error", error.message || "Failed to load roles data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [serverId, token, logout]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRole) {
      originalUserIdsRef.current = selectedRole.users?.map((u) => u.id) || [];
    }
  }, [selectedRoleId]);

  const updateRoleName = (name: string) => {
    if (!selectedRole) return;
    setRoles(roles.map((r) => (r.id === selectedRole.id ? { ...r, name } : r)));
  };

  const togglePermission = (perm: string) => {
    if (!selectedRole) return;
    const hasPermission = selectedRole.permissions.includes(perm);
    const newPerms = hasPermission
      ? selectedRole.permissions.filter((p) => p !== perm)
      : [...selectedRole.permissions, perm];
    setRoles(roles.map((r) => (r.id === selectedRole.id ? { ...r, permissions: newPerms } : r)));
  };

  const toggleUserRole = (user: User) => {
    if (!selectedRole) return;
    const roleUsers = selectedRole.users ?? [];
    const hasUser = roleUsers.some((u) => u.id === user.id);
    const newUsers = hasUser ? roleUsers.filter((u) => u.id !== user.id) : [...roleUsers, user];
    setRoles(roles.map((r) => (r.id === selectedRole.id ? { ...r, users: newUsers } : r)));
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      // Update role name and permissions via PUT
      await apiUpdateRole(
        token,
        serverId,
        selectedRole.id,
        selectedRole.name,
        selectedRole.permissions,
        [],
        logout
      );

      // Diff user assignments and apply changes
      const newUserIds = selectedRole.users?.map((u) => u.id) || [];
      const addedUserIds = newUserIds.filter((id) => !originalUserIdsRef.current.includes(id));
      const removedUserIds = originalUserIdsRef.current.filter((id) => !newUserIds.includes(id));

      for (const uid of addedUserIds) {
        await assignRole(token, serverId, uid, selectedRole.id, logout);
      }

      for (const uid of removedUserIds) {
        await unassignRole(token, serverId, uid, selectedRole.id, logout);
      }

      originalUserIdsRef.current = newUserIds;
      showToast("Role saved successfully");
    } catch (error: any) {
      RNAlert.alert("Error", error.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) {
      RNAlert.alert("Error", "Role name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const createdRole = await apiCreateRole(token, serverId, newRoleName.trim(), logout);
      const newRole = { ...createdRole, permissions: createdRole.permissions || [], users: createdRole.users || [] };
      setRoles([...roles, newRole]);
      setSelectedRoleId(newRole.id);
      setNewRoleName("");
      showToast("Role created");
    } catch (error: any) {
      RNAlert.alert("Error", error.message || "Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async () => {
    if (!selectedRole) return;

    const doDelete = async () => {
      setSaving(true);
      try {
        await apiDeleteRole(token, serverId, selectedRole.id, logout);
        const remaining = roles.filter((r) => r.id !== selectedRole.id);
        setRoles(remaining);
        setSelectedRoleId(remaining.length > 0 ? remaining[0].id : null);
        showToast("Role deleted");
      } catch (error: any) {
        if (Platform.OS === "web") {
          window.alert(error.message || "Failed to delete role");
        } else {
          RNAlert.alert("Error", error.message || "Failed to delete role");
        }
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete role "${selectedRole.name}"? This cannot be undone.`)) {
        await doDelete();
      }
    } else {
      RNAlert.alert(
        "Delete Role",
        `Delete role "${selectedRole.name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner color="white" size="large" />
      </YStack>
    );
  }

  // Render the role list (sidebar on desktop, full view on mobile when no role selected)
  const renderRoleList = () => (
    <YStack flex={isMobile && !selectedRoleId ? 1 : undefined} width={isMobile ? "100%" : 200} backgroundColor="#2D2E3F" padding="$2">
      <Text fontSize="$5" fontWeight="700" color="white" marginBottom="$2" fontFamily={fontFamily}>
        Roles ({roles.length})
      </Text>
      <YStack marginTop="$2" marginBottom="$2" gap="$2">
        <Input
          placeholder="New role name"
          //@ts-ignore
          placeholderTextColor="#6B7280"
          value={newRoleName}
          onChangeText={setNewRoleName}
          backgroundColor="#2D2E3F"
          borderWidth={0}
          color="white"
          fontSize="$3"
          fontFamily={fontFamily}
        />
        <Button
          backgroundColor="#0EA5E9"
          onPress={createRole}
          disabled={saving || !newRoleName.trim()}
          disabledStyle={{ opacity: 0.5 }}
          size="$3"
          pressStyle={{ backgroundColor: "#0284C7" }}
        >
          Create Role
        </Button>
      </YStack>
      <ScrollView flex={1}>
        <YStack gap="$1">
          {roles.map((role) => (
            <YStack>
              <Separator backgroundColor="#2D2E3F" marginBottom="$1" marginTop="$1"/>
            <TouchableOpacity key={role.id} onPress={() => setSelectedRoleId(role.id)}>
              <YStack
                padding="$3"
                backgroundColor={role.id === selectedRoleId ? "#0EA5E9" : "transparent"}
                borderRadius="$2"
              >
                <XStack alignItems="center" gap="$1">
                  <Text color="white" fontSize="$3" fontFamily={fontFamily}>{role.name}</Text>
                  {role.is_default && (
                    <Text color="#0EA5E9" fontSize="$1" fontWeight="600" fontFamily={fontFamily}>(Default)</Text>
                  )}
                </XStack>
                <Text color={role.id === selectedRoleId ? "rgba(255,255,255,0.7)" : "#6B7280"} fontSize="$1" fontFamily={fontFamily}>
                  {role.users?.length || 0} members · {role.permissions?.length || 0} permissions
                </Text>
              </YStack>
            </TouchableOpacity>
            </YStack>
          ))}

          {roles.length === 0 && (
            <YStack padding="$3">
              <Text color="#6B7280" fontSize="$3" textAlign="center" fontFamily={fontFamily}>
                No roles yet
              </Text>
            </YStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );

  // Render the role detail editor
  const renderRoleDetail = () => {
    if (!selectedRole) {
      return (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
          <Text color="#6B7280" fontSize="$4" fontFamily={fontFamily}>Select a role to edit</Text>
        </YStack>
      );
    }

    return (
      <ScrollView flex={1} backgroundColor="#171823" padding="$3">
        <YStack gap="$3">
          {/* Back button on mobile */}
          {isMobile && (
            <TouchableOpacity onPress={() => setSelectedRoleId(null)}>
              <XStack alignItems="center" gap="$2">
                <ChevronLeft size={20} color="#9CA3AF" />
                <Text color="#9CA3AF" fontSize="$3" fontFamily={fontFamily}>Back to roles</Text>
              </XStack>
            </TouchableOpacity>
          )}

          {/* Role Name + Delete */}
          <Text fontSize="$4" fontWeight="600" color="white" fontFamily={fontFamily}>
            Role Name
          </Text>
          <XStack alignItems="center" gap="$2">
            <Input
              flex={1}
              value={selectedRole.name}
              onChangeText={updateRoleName}
              backgroundColor="#2D2E3F"
              borderWidth={0}
              color="white"
              fontSize="$4"
              fontFamily={fontFamily}
            />
            <Button
              circular
              size="$4"
              backgroundColor={selectedRole.is_default ? "#4B5563" : "#EF4444"}
              icon={<Trash2 size={18} color="white" />}
              onPress={selectedRole.is_default ? () => RNAlert.alert("Cannot Delete", "The default role cannot be deleted.") : deleteRole}
              disabled={saving || selectedRole.is_default}
              marginLeft="$2"
            />
          </XStack>

          <Separator borderColor="#444" />

          {/* Permissions */}
          <YStack gap="$2">
            <Text fontSize="$4" fontWeight="600" color="white" marginBottom="$2" fontFamily={fontFamily}>
              Permissions
            </Text>
            <YStack backgroundColor="#2D2E3F" padding="$2" borderRadius="$2" gap="$1">
              {availablePermissions.map((perm) => {
                const active = selectedRole.permissions.includes(perm);
                return (
                  <TouchableOpacity key={perm} onPress={() => togglePermission(perm)}>
                    <XStack
                      padding="$2"
                      borderRadius="$2"
                      alignItems="center"
                      gap="$2"
                      backgroundColor={active ? "rgba(88,101,242,0.15)" : "transparent"}
                    >
                      <YStack
                        width={22}
                        height={22}
                        borderRadius={4}
                        borderWidth={2}
                        borderColor={active ? "#0EA5E9" : "#6B7280"}
                        backgroundColor={active ? "#0EA5E9" : "transparent"}
                        justifyContent="center"
                        alignItems="center"
                      >
                        {active && <Check size={14} color="white" />}
                      </YStack>
                      <Text color="white" fontSize="$3" fontFamily={fontFamily}>
                        {PERMISSION_LABELS[perm] || perm}
                      </Text>
                    </XStack>
                  </TouchableOpacity>
                );
              })}
            </YStack>
          </YStack>

          <Separator borderColor="#444" />

          {/* Assigned Users */}
          <YStack gap="$2">
            <Text fontSize="$4" fontWeight="600" color="white" marginBottom="$2" fontFamily={fontFamily}>
              Assigned Users
            </Text>
            <YStack backgroundColor="#2D2E3F" padding="$2" borderRadius="$2" gap="$1">
              {users.map((user) => {
                const assigned = selectedRole.users?.some((u) => u.id === user.id) ?? false;
                return (
                  <TouchableOpacity key={user.id} onPress={() => toggleUserRole(user)}>
                    <XStack
                      padding="$2"
                      borderRadius="$2"
                      alignItems="center"
                      gap="$2"
                      backgroundColor={assigned ? "rgba(88,101,242,0.15)" : "transparent"}
                    >
                      <YStack
                        width={22}
                        height={22}
                        borderRadius={4}
                        borderWidth={2}
                        borderColor={assigned ? "#0EA5E9" : "#6B7280"}
                        backgroundColor={assigned ? "#0EA5E9" : "transparent"}
                        justifyContent="center"
                        alignItems="center"
                      >
                        {assigned && <Check size={14} color="white" />}
                      </YStack>
                      <Text color="white" fontSize="$3" fontFamily={fontFamily}>
                        {user.username}
                      </Text>
                    </XStack>
                  </TouchableOpacity>
                );
              })}
              {users.length === 0 && (
                <Text color="#6B7280" fontSize="$3" padding="$2" fontFamily={fontFamily}>
                  No members in this server
                </Text>
              )}
            </YStack>
          </YStack>

          {/* Save Button */}
          <Button
            backgroundColor="#0EA5E9"
            onPress={saveRole}
            disabled={saving}
            size="$4"
            pressStyle={{ backgroundColor: "#0284C7" }}
            marginTop="$2"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </YStack>
      </ScrollView>
    );
  };

  if (isMobile) {
    // Mobile: show role list or role detail, not both
    if (selectedRoleId && selectedRole) {
      return (
        <YStack flex={1}>
          {renderRoleDetail()}
          {snackbarVisible && (
            <YStack position="absolute" bottom={20} alignSelf="center" backgroundColor="#252636" padding="$3" borderRadius="$3">
              <Text color="white" fontFamily={fontFamily}>{snackbarMessage}</Text>
            </YStack>
          )}
        </YStack>
      );
    }
    return (
      <YStack flex={1}>
        {renderRoleList()}
        {snackbarVisible && (
          <YStack position="absolute" bottom={20} alignSelf="center" backgroundColor="#252636" padding="$3" borderRadius="$3">
            <Text color="white" fontFamily={fontFamily}>{snackbarMessage}</Text>
          </YStack>
        )}
      </YStack>
    );
  }

  // Desktop: side-by-side layout
  return (
    <XStack flex={1} height="100%">
      {renderRoleList()}
      {renderRoleDetail()}
      {snackbarVisible && (
        <YStack position="absolute" bottom={20} alignSelf="center" backgroundColor="#252636" padding="$3" borderRadius="$3" zIndex={100}>
          <Text color="white" fontFamily={fontFamily}>{snackbarMessage}</Text>
        </YStack>
      )}
    </XStack>
  );
};

export default RolesSettings;
