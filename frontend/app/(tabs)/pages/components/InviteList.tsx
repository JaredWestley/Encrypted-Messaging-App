import React, { useEffect, useState } from "react";
import { YStack, XStack, Text, Button, Spinner, ScrollView } from "tamagui";
import { Alert as RNAlert } from "react-native";
import { getServerInvites, deleteInvite } from "../../utils/api";



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

  const handleDelete = (inviteToken: string) => {
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
              await deleteInvite(token, inviteToken, logout);
              setInvites((prev) => prev.filter((inv) => inv.token !== inviteToken));
            } catch (error: any) {
              RNAlert.alert("Error", "Failed to delete invite");
            }
          },
        },
      ]
    );
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
    <ScrollView maxHeight={300}>
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
              backgroundColor="#f04747"
              onPress={() => handleDelete(invite.token)}
            >
              Delete
            </Button>
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  );
};

export default InviteList;