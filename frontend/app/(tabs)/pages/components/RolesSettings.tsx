import React, { useState, useEffect, useRef } from "react";
import { YStack, XStack, Text, Input, Button, ScrollView, Spinner, Checkbox, Label, Separator } from "tamagui";
import { TouchableOpacity, Alert as RNAlert } from "react-native";
import { Trash2 } from "@tamagui/lucide-icons";
import {
  fetchRoles,
  createRole as apiCreateRole,
  updateRole as apiUpdateRole,
  deleteRole as apiDeleteRole,
  fetchUsersInServer,
  fetchPermissions,
  assignRole,
  unassignRole,
} from "../../utils/api";

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_CHANNEL: "View Channel",
  SEND_MESSAGES: "Send Messages",
  MANAGE_ROLES: "Manage Roles",
  KICK_MEMBERS: "Kick Members",
  BAN_MEMBERS: "Ban Members",
  DELETE_MESSAGES: "Delete Messages",
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
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const originalUserIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const rolesData = await fetchRoles(token, serverId, logout);
        const usersData = await fetchUsersInServer(token, serverId, logout);
        const permissionsData = await fetchPermissions(token, logout);

        setRoles(rolesData);
        setUsers(usersData);
        setAvailablePermissions(permissionsData);
        if (rolesData.length > 0) setSelectedRoleId(rolesData[0].id);
      } catch (error: any) {
        RNAlert.alert("Error", error.message);
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
  }, [selectedRole]);

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
    const users = selectedRole.users ?? [];
    const hasUser = users.some((u) => u.id === user.id);
    const newUsers = hasUser ? users.filter((u) => u.id !== user.id) : [...users, user];
    setRoles(roles.map((r) => (r.id === selectedRole.id ? { ...r, users: newUsers } : r)));
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await apiUpdateRole(
        token,
        serverId,
        selectedRole.id,
        selectedRole.name,
        selectedRole.permissions,
        [],
        logout,
        selectedRole.is_default || false
      );

      const newUserIds = selectedRole.users?.map((u) => u.id) || [];
      const addedUserIds = newUserIds.filter((id) => !originalUserIdsRef.current.includes(id));
      const removedUserIds = originalUserIdsRef.current.filter((id) => !newUserIds.includes(id));

      for (const userId of addedUserIds) {
        await assignRole(token, serverId, userId, selectedRole.id, logout);
      }

      for (const userId of removedUserIds) {
        await unassignRole(token, serverId, userId, selectedRole.id, logout);
      }

      RNAlert.alert("Success", "Role saved successfully");
      originalUserIdsRef.current = newUserIds;
    } catch (error: any) {
      RNAlert.alert("Error", error.message);
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
      setRoles([...roles, createdRole]);
      setSelectedRoleId(createdRole.id);
      setNewRoleName("");
    } catch (error: any) {
      RNAlert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async () => {
    if (!selectedRole) return;
    RNAlert.alert(
      "Delete Role",
      `Delete role "${selectedRole.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await apiDeleteRole(token, serverId, selectedRole.id, logout);
              setRoles(roles.filter((r) => r.id !== selectedRole.id));
              setSelectedRoleId(roles.length > 1 ? roles[0].id : null);
            } catch (error: any) {
              RNAlert.alert("Error", error.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner color="white" size="large" />
      </YStack>
    );
  }

  return (
    <XStack flex={1} height="100%">
      {/* Roles List */}
      <YStack width={200} backgroundColor="#202225" padding="$2">
        <Text fontSize="$6" fontWeight="700" color="white" marginBottom="$2">
          Roles
        </Text>
        <ScrollView flex={1}>
          <YStack>
            {roles.map((role) => (
              <TouchableOpacity key={role.id} onPress={() => setSelectedRoleId(role.id)}>
                <YStack
                  padding="$3"
                  backgroundColor={role.id === selectedRoleId ? "#5865F2" : "transparent"}
                  borderRadius="$2"
                  pressStyle={{
                    backgroundColor: "#40444b",
                  }}
                >
                  <Text color="white">{role.name}</Text>
                </YStack>
              </TouchableOpacity>
            ))}
          </YStack>
        </ScrollView>

        <YStack marginTop="$2">
          <Input
            placeholder="New Role Name"
            value={newRoleName}
            onChangeText={setNewRoleName}
            backgroundColor="#40444b"
            borderWidth={0}
            color="white"
          />
          <Button
            backgroundColor="#5865F2"
            onPress={createRole}
            disabled={saving}
          >
            Create Role
          </Button>
        </YStack>
      </YStack>

      {/* Role Details */}
      <ScrollView flex={1} backgroundColor="#2f3136" padding="$3">
        {!selectedRole ? (
          <Text color="white">Select a role to view/edit details.</Text>
        ) : (
          <YStack>
            {/* Role Name */}
            <XStack alignItems="center">
              <Input
                flex={1}
                value={selectedRole.name}
                onChangeText={updateRoleName}
                backgroundColor="#202225"
                borderWidth={0}
                color="white"
              />
              <Button
                circular
                backgroundColor="#f04747"
                icon={<Trash2 size={20} color="white" />}
                onPress={deleteRole}
                disabled={saving}
              />
            </XStack>

            <Separator borderColor="#444" />

            {/* Permissions */}
            <YStack>
              <Text fontSize="$5" fontWeight="600" color="white">
                Permissions
              </Text>
              <ScrollView maxHeight={200} backgroundColor="#202225" padding="$2" borderRadius="$2">
                <YStack>
                  {availablePermissions.map((perm) => (
                    <XStack key={perm} alignItems="center">
                      <Checkbox
                        checked={selectedRole.permissions.includes(perm)}
                        onCheckedChange={() => togglePermission(perm)}
                        size="$4"
                      >
                        <Checkbox.Indicator>
                          <Text>✓</Text>
                        </Checkbox.Indicator>
                      </Checkbox>
                      <Label color="white" fontSize="$3">
                        {PERMISSION_LABELS[perm] || perm}
                      </Label>
                    </XStack>
                  ))}
                </YStack>
              </ScrollView>
            </YStack>

            <Separator borderColor="#444" />

            {/* Assigned Users */}
            <YStack>
              <Text fontSize="$5" fontWeight="600" color="white">
                Assigned Users
              </Text>
              <ScrollView maxHeight={200} backgroundColor="#202225" padding="$2" borderRadius="$2">
                <YStack>
                  {users.map((user) => {
                    const assigned = selectedRole.users?.some((u) => u.id === user.id) ?? false;
                    return (
                      <XStack key={user.id} alignItems="center">
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() => toggleUserRole(user)}
                          size="$4"
                        >
                          <Checkbox.Indicator>
                            <Text>✓</Text>
                          </Checkbox.Indicator>
                        </Checkbox>
                        <Label color="white" fontSize="$3">
                          {user.username}
                        </Label>
                      </XStack>
                    );
                  })}
                </YStack>
              </ScrollView>
            </YStack>

            <Button
              backgroundColor="#5865F2"
              onPress={saveRole}
              disabled={saving}
              marginTop="$4"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </YStack>
        )}
      </ScrollView>
    </XStack>
  );
};

export default RolesSettings;