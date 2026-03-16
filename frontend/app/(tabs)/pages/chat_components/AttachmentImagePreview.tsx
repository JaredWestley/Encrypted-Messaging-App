import React, { useState, useEffect } from "react";
import { YStack, XStack, Text, Spinner } from "tamagui";
import { Platform, TouchableOpacity, Image as RNImage } from "react-native";
import { Download } from "@tamagui/lucide-icons";
import { File as ExpoFile, Paths } from "expo-file-system";
import {
  decryptFileBytes,
  decryptFileBytesFromDm,
  encodeBase64,
  decodeBase64,
} from "../../../../utils/encryption";
import { downloadAttachment, fetchPublicKey } from "../../../../utils/api";
import { API_URL } from "../../../../utils/config";
import type { MessageAttachment, ImageDecryptContext } from "./types";

// ─── Image cache ────────────────────────────────────
// Survives component remounts so images don't re-download/re-decrypt
export const _imageCache = new Map<number, string>();

export const isImageMimeType = (mime: string) =>
  ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentImagePreview = React.memo(function AttachmentImagePreview({
  attachment,
  ctxRef,
}: {
  attachment: MessageAttachment;
  ctxRef: React.RefObject<ImageDecryptContext>;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check cache first
    const cached = _imageCache.get(attachment.id);
    if (cached) {
      setImageUri(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ctx = ctxRef.current;
        if (!ctx.token) return;

        const effectiveNonce = attachment.encryption_nonce;
        const fileKeyEncrypted = attachment.file_key_encrypted;
        const fileKeyNonce = attachment.file_key_nonce;

        let encryptedData: Uint8Array;

        if (Platform.OS === "web") {
          const result = await downloadAttachment(attachment.id, ctx.token, ctx.logout);
          if (cancelled) return;
          encryptedData = new Uint8Array(result.bytes);
        } else {
          const tempFile = new ExpoFile(Paths.cache, `enc_preview_${attachment.id}_${Date.now()}.tmp`);
          const downloaded = await ExpoFile.downloadFileAsync(
            `${API_URL}/attachments/${attachment.id}`,
            tempFile,
            { headers: { Authorization: `Bearer ${ctx.token}` }, idempotent: true }
          );
          if (cancelled) return;
          const base64Enc = await downloaded.base64();
          encryptedData = decodeBase64(base64Enc);
          try { downloaded.delete(); } catch {}
        }

        let decryptedBytes: Uint8Array | null = null;

        if (fileKeyEncrypted && fileKeyNonce && ctx.isDmMode && ctx.activeConversation) {
          const mySecretKey = ctx.myKeyPairRef.current?.secretKey;
          if (mySecretKey) {
            if (attachment.uploader_id === ctx.userId && attachment.sender_file_key_encrypted && attachment.sender_file_key_nonce) {
              decryptedBytes = decryptFileBytesFromDm(
                encryptedData, effectiveNonce, attachment.sender_file_key_encrypted, attachment.sender_file_key_nonce,
                ctx.myKeyPairRef.current.publicKey, mySecretKey
              );
            }
            if (!decryptedBytes) {
              for (const member of ctx.activeConversation.members) {
                if (member.id === ctx.userId) continue;
                try {
                  const pubKeyData = await fetchPublicKey(ctx.token, member.id, ctx.logout);
                  if (pubKeyData.public_key) {
                    decryptedBytes = decryptFileBytesFromDm(
                      encryptedData, effectiveNonce, fileKeyEncrypted, fileKeyNonce,
                      decodeBase64(pubKeyData.public_key), mySecretKey
                    );
                    if (decryptedBytes) break;
                  }
                } catch { /* try next */ }
              }
            }
          }
        } else {
          const serverId = ctx.selectedServerRef.current?.id;
          if (serverId) {
            let serverKeyBytes = await ctx.getServerKey(serverId);
            if (!serverKeyBytes) {
              await ctx.fetchAndCacheServerKey(serverId);
              serverKeyBytes = await ctx.getServerKey(serverId);
            }
            if (serverKeyBytes) {
              decryptedBytes = decryptFileBytes(encryptedData, effectiveNonce, serverKeyBytes);
            }
          }
        }

        if (decryptedBytes && !cancelled) {
          let uri: string;
          if (Platform.OS === "web") {
            const blob = new Blob([decryptedBytes as any], { type: attachment.mime_type });
            uri = URL.createObjectURL(blob);
          } else {
            const base64 = encodeBase64(decryptedBytes);
            uri = `data:${attachment.mime_type};base64,${base64}`;
          }
          _imageCache.set(attachment.id, uri);
          setImageUri(uri);
        }
      } catch (err) {
        console.error("Failed to load image preview:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attachment.id, ctxRef]);

  if (loading) {
    return (
      <YStack padding="$2" alignItems="center">
        <Spinner size="small" color="#0EA5E9" />
        <Text color="#6B7280" fontSize="$2">Decrypting image...</Text>
      </YStack>
    );
  }

  if (!imageUri) {
    return (
      <Text color="#ff6b6b" fontSize="$2">Failed to decrypt image</Text>
    );
  }

  return (
    <YStack gap="$2">
      <TouchableOpacity onPress={() => ctxRef.current.handleDownloadAttachment(attachment)}>
        {Platform.OS === "web" ? (
          <img
            src={imageUri}
            alt={attachment.original_filename}
            style={{
              maxWidth: "100%",
              maxHeight: 300,
              borderRadius: 8,
              objectFit: "contain",
              cursor: "pointer",
            }}
          />
        ) : (
          <RNImage
            source={{ uri: imageUri }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: 8,
            }}
            resizeMode="contain"
          />
        )}
      </TouchableOpacity>
      <XStack alignItems="center" gap="$2">
        <Text color="#6B7280" fontSize="$2">{attachment.original_filename}</Text>
        <Text color="#6B7280" fontSize="$1">({formatFileSize(attachment.file_size)})</Text>
        <TouchableOpacity onPress={() => ctxRef.current.handleDownloadAttachment(attachment)}>
          <Download size={14} color="#0EA5E9" />
        </TouchableOpacity>
      </XStack>
    </YStack>
  );
});

export default AttachmentImagePreview;
