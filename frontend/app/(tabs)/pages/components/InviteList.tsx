import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Spinner, ScrollView, Card } from "tamagui";
import { Alert as RNAlert, Platform, useWindowDimensions } from "react-native";
import { getServerInvites, deleteInvite } from "../../../../utils/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";


interface InviteListProps {
  serverId: number;
  token: string;
  logout: () => void;
  refreshTrigger: number;
}

const InviteList: React.FC<InviteListProps> = ({
  serverId,
  token,
  logout,
  refreshTrigger,
}) => {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
    setTimeout(() => setSnackbarVisible(false), 3000);
  };

  useEffect(() => {
    const fetchInvites = async () => {
      setLoading(true);
      try {
        const res = await getServerInvites(token, serverId, logout);
        setInvites(res);
      } catch (error) {
        console.error("Failed to fetch invites:", error);
        setInvites([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInvites();
  }, [serverId, token, refreshTrigger, logout]);

  const handleDelete = async (inviteToken: string) => {
    if (!inviteToken) return;

    const doDelete = async () => {
        setLoading(true);
        try {
          await deleteInvite(token, inviteToken, logout);
          setInvites(prev =>
            prev.filter(inv => inv.token !== inviteToken)
          );
          showSnackbar("Invite deleted");
        } catch (error: any) {
          if (Platform.OS === "web") {
            showSnackbar(error.message || "Failed to delete role");
          } else {
            RNAlert.alert("Error", error.message || "Failed to delete role");
          }
        } finally {
          setLoading(false);
        }
      };
    
    if (Platform.OS === "web") {
      if (window.confirm(`Delete invite "${inviteToken}"? This cannot be undone.`)) {
        await doDelete();
      }
    } else {
      RNAlert.alert(
        "Delete Invite",
        `Delete invite link ${inviteToken.substring(0, 8)}...?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await doDelete();
                setInvites((prev) => prev.filter((inv) => inv.token !== inviteToken));
              } catch (error: any) {
                RNAlert.alert("Error", "Failed to delete invite");
              }
            },
          },
        ]
      );
  };
};

  const copyToClipboard = async (text: string) => {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        // Fallback for older browsers
        if (Platform.OS === "web" && typeof document !== "undefined") {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          return true;
        }
      } catch {
        // Copy failed
      }
      return false;
    };

  if (loading) {
    return (
      <YStack paddingVertical="$4" alignItems="center">
        <Spinner color="white" />
      </YStack>
    );
  }

  if (invites.length === 0) {
    return (
      <YStack paddingVertical="$4">
        <Text color="#b9bbbe" fontSize="$3" textAlign="center">
          No invite links yet. Generate one above!
        </Text>
      </YStack>
    );
  }

  return (
    // @ts-ignore
    <ScrollView maxHeight={"100vh" - insets.bottom}>
      <YStack gap="$2">
        {invites.map((invite) => (
          <XStack
            key={invite.token}
            padding="$3"
            backgroundColor="#36393f"
            borderRadius="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            <YStack flex={1} marginRight="$2">
              <Text color="white" fontSize="$3" numberOfLines={1} selectable>
                {invite.token}
              </Text>
              <Text color="#b9bbbe" fontSize="$2" marginTop="$1">
                Created: {new Date(invite.created_at).toLocaleDateString()}
              </Text>
            </YStack>
            <Button
              size="$3"
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="#5865F2"
              onPress={async () => {
                const copied = await copyToClipboard(invite.token);
                if (Platform.OS === "web") {
                  showSnackbar(copied ? "Invite token copied to clipboard!" : "Could not copy automatically. Please select and copy the token manually.");
                } else {
                  RNAlert.alert(
                    copied ? "Copied" : "Info",
                    copied ? "Invite token copied to clipboard" : "Select and copy the token manually"
                  );
                }
              }}
            >
              Copy
            </Button>
            <Button
              size="$3"
              backgroundColor="#f04747"
              disabled={saving}
              marginLeft="$2"
              onPress={() => handleDelete(invite.token)}
            >
              Delete
            </Button>
          </XStack>
        ))}
      </YStack>
      {/* Snackbar */}
      {snackbarVisible && (
        <Card
              position="absolute"
              alignSelf="center"
              backgroundColor="#323232"
              padding={isMobile ? "$4" : "$3"}
              borderRadius="$4"
              marginHorizontal="$4"
              maxWidth={isMobile ? "90%" : 400}
              shadowColor="black"
              shadowOffset={{ width: 0, height: 4 }}
              shadowOpacity={0.3}
              shadowRadius={8}
            >
          <Text color="white" fontSize="$3">{snackbarMessage}</Text>
        </Card>
      )}
    </ScrollView>
  );
};

export default InviteList;