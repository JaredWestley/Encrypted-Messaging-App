// Must be imported BEFORE tweetnacl to provide crypto.getRandomValues on React Native
import 'react-native-get-random-values';

/**
 * Encryption utilities using TweetNaCl.js
 *
 * DMs use asymmetric encryption (box):
 *   - Each user has an X25519 keypair
 *   - Messages are encrypted with nacl.box (sender private + recipient public)
 *   - Only the sender and recipient can decrypt
 *
 * Servers use symmetric encryption (secretbox):
 *   - Each server has a shared secret key
 *   - The server owner generates the key and encrypts it per-member using box
 *   - Messages are encrypted with nacl.secretbox (shared key)
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";

// ─── Key Generation ──────────────────────────────────────────────

/** Generate a new X25519 keypair for DM encryption */
export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

/** Generate a random symmetric key for server encryption */
export function generateServerKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

// ─── DM Encryption (asymmetric box) ─────────────────────────────

/** Encrypt a message for DM using nacl.box (sender private + recipient public) */
export function encryptDmMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const messageBytes = decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);

  if (!encrypted) {
    throw new Error("Encryption failed");
  }

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/** Decrypt a DM message using nacl.box.open (recipient private + sender public) */
export function decryptDmMessage(
  ciphertext: string,
  nonceB64: string,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  try {
    const encryptedBytes = decodeBase64(ciphertext);
    const nonce = decodeBase64(nonceB64);
    const decrypted = nacl.box.open(encryptedBytes, nonce, senderPublicKey, recipientSecretKey);

    if (!decrypted) {
      return null; // Decryption failed (wrong keys or tampered)
    }

    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}

// ─── Server Encryption (symmetric secretbox) ─────────────────────

/** Encrypt a message for a server using nacl.secretbox (shared server key) */
export function encryptServerMessage(
  plaintext: string,
  serverKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const messageBytes = decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(messageBytes, nonce, serverKey);

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/** Decrypt a server message using nacl.secretbox.open */
export function decryptServerMessage(
  ciphertext: string,
  nonceB64: string,
  serverKey: Uint8Array
): string | null {
  try {
    const encryptedBytes = decodeBase64(ciphertext);
    const nonce = decodeBase64(nonceB64);
    const decrypted = nacl.secretbox.open(encryptedBytes, nonce, serverKey);

    if (!decrypted) {
      return null;
    }

    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}

// ─── Server Key Distribution ─────────────────────────────────────

/** Encrypt a server key for a specific member (so only they can read it) */
export function encryptServerKeyForMember(
  serverKey: Uint8Array,
  memberPublicKey: Uint8Array,
  ownerSecretKey: Uint8Array
): { encryptedKey: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(serverKey, nonce, memberPublicKey, ownerSecretKey);

  if (!encrypted) {
    throw new Error("Failed to encrypt server key");
  }

  return {
    encryptedKey: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/** Decrypt a server key that was encrypted for us */
export function decryptServerKey(
  encryptedKeyB64: string,
  nonceB64: string,
  ownerPublicKey: Uint8Array,
  memberSecretKey: Uint8Array
): Uint8Array | null {
  try {
    const encryptedKey = decodeBase64(encryptedKeyB64);
    const nonce = decodeBase64(nonceB64);
    const decrypted = nacl.box.open(encryptedKey, nonce, ownerPublicKey, memberSecretKey);
    return decrypted;
  } catch {
    return null;
  }
}

// ─── Base64 Helpers ──────────────────────────────────────────────

export { encodeBase64, decodeBase64 };
