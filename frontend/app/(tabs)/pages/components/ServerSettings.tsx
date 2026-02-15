import React, { useState } from "react";
import { YStack, XStack, Text, Input, Button, Separator } from "tamagui";
import { Alert as RNAlert, Image, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { renameServer, deleteServer, uploadServerIcon } from "../../utils/api";

interface ServerSettingsProps {
  serverId: number;
  token: string;
  logout: () => void;
  currentIcon?: string;
  currentName: string;
  isOwner: boolean;
  onServerDeleted: () => void;
  onServerRenamed: (newName: string) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({
  serverId,
  token,
  logout,
  currentIcon,
  currentName,
  isOwner,
  onServerDeleted,
  onServerRenamed,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [serverIconUrl, setServerIconUrl] = useState<string | null>(null);

  const showToast = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === currentName) return;

    try {
      setLoading(true);
      const response = await renameServer(token, serverId, newName, logout);
      onServerRenamed(newName);
      showToast(response.detail || "Server renamed successfully.");
    } catch (err: any) {
      RNAlert.alert("Error", err.message || "Failed to rename server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner) {
      RNAlert.alert("Error", "Only the server owner can delete the server");
      return;
    }

    RNAlert.alert(
      "Delete Server",
      "Are you sure you want to delete this server? This action is irreversible.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteServer(token, serverId, logout);
              onServerDeleted();
            } catch (err: any) {
              RNAlert.alert("Error", err.message || "Failed to delete server.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      RNAlert.alert("Permission Denied", "We need camera roll permissions to change the server icon.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setPreviewUri(result.assets[0].uri);
    }
  };

  const handleIconUpload = async () => {
    if (!previewUri) return;

    const formData = new FormData();
    const filename = previewUri.split("/").pop() || "upload.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";

    if (Platform.OS === "web") {
      // On web, fetch the URI as a blob and append it properly
      const response = await fetch(previewUri);
      const blob = await response.blob();
      formData.append("file", blob, filename);
    } else {
      // On native, the { uri, name, type } object works with React Native's FormData
      formData.append("file", {
        uri: previewUri,
        name: filename,
        type,
      } as any);
    }

    try {
      setLoading(true);
      const res = await uploadServerIcon(formData, serverId, token, logout);
      setServerIconUrl("http://localhost:8000" + res.icon_url);
      setPreviewUri(null);
      showToast("Server icon uploaded successfully.");
    } catch (error: any) {
      RNAlert.alert("Error", "Upload failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getFirstLetter = (name: string | undefined | null): string => {
    if (!name || typeof name !== "string") return "?";
    for (const char of name) {
      if (/[a-zA-Z]/.test(char)) return char.toUpperCase();
    }
    return "?";
  };

  return (
    <YStack>
      <Text fontSize="$6" fontWeight="700" color="white">
        Edit Server
      </Text>

      {/* Server Name */}
      <YStack>
        <Text color="#b9bbbe" fontSize="$3">
          Server Name
        </Text>
        <Input
          value={newName}
          onChangeText={setNewName}
          disabled={!isOwner || loading}
          backgroundColor="#202225"
          borderWidth={0}
          color="white"
        />
        <Button
          backgroundColor="#5865F2"
          onPress={handleRename}
          disabled={loading || !newName.trim() || newName === currentName || !isOwner}
        >
          Save Changes
        </Button>
      </YStack>

      <Separator borderColor="#444" marginVertical="$2" />

      {/* Server Icon */}
      <YStack>
        <Text color="#b9bbbe" fontSize="$3">
          Server Icon
        </Text>
        
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
          />
        ) : serverIconUrl ? (
          <Image
            source={{ uri: serverIconUrl }}
            style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
          />
        ) : currentIcon ? (
          <Image
            source={{ uri: `http://localhost:8000${currentIcon}` }}
            style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }}
          />
        ) : (
          <YStack
            width={80}
            height={80}
            borderRadius={40}
            backgroundColor="#757575"
            justifyContent="center"
            alignItems="center"
            marginBottom={8}
          >
            <Text fontSize="$9" fontWeight="700" color="white">
              {getFirstLetter(currentName)}
            </Text>
          </YStack>
        )}

        <XStack>
          <Button
            flex={1}
            backgroundColor="transparent"
            borderWidth={1}
            borderColor="#5865F2"
            onPress={pickImage}
            disabled={!isOwner || loading}
          >
            Choose Icon
          </Button>
          <Button
            flex={1}
            backgroundColor="#5865F2"
            onPress={handleIconUpload}
            disabled={!previewUri || loading}
          >
            Upload
          </Button>
        </XStack>
      </YStack>

      {/* Danger Zone */}
      {isOwner && (
        <>
          <Separator borderColor="#444" marginVertical="$4" />
          <YStack>
            <Text fontSize="$5" fontWeight="700" color="#f04747">
              Danger Zone
            </Text>
            <Text color="#b9bbbe" fontSize="$3">
              Deleting a server is permanent and cannot be undone.
            </Text>
            <Button
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#f04747"
              onPress={handleDelete}
              disabled={loading}
            >
              Delete Server
            </Button>
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

export default ServerSettings;