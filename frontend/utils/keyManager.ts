/**
 * Key lifecycle management — generates, stores, and retrieves encryption keys.
 *
 * Private keys are stored in secure storage (Keychain on iOS, Keystore on Android,
 * AsyncStorage on web). Public keys are uploaded to the server.
 */

import { setSecureItem, getSecureItem, deleteSecureItem } from "./secureStorage";
import { generateKeyPair, encodeBase64, decodeBase64 } from "./encryption";

const PRIVATE_KEY_STORAGE_KEY = "encryption_private_key";
const PUBLIC_KEY_STORAGE_KEY = "encryption_public_key";

// ─── User Keypair ────────────────────────────────────────────────

/** Get the stored keypair, or generate + store a new one */
export async function getOrCreateKeyPair(): Promise<{
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}> {
  const existingPrivate = await getSecureItem(PRIVATE_KEY_STORAGE_KEY);
  const existingPublic = await getSecureItem(PUBLIC_KEY_STORAGE_KEY);

  if (existingPrivate && existingPublic) {
    console.log(`[KeyDebug] getOrCreateKeyPair: RETRIEVED existing keypair from secure storage (pub=${existingPublic.substring(0, 20)}...)`);
    return {
      publicKey: decodeBase64(existingPublic),
      secretKey: decodeBase64(existingPrivate),
    };
  }

  // Generate new keypair
  console.log(`[KeyDebug] getOrCreateKeyPair: GENERATING new keypair (no existing keys in storage)`);
  const keyPair = generateKeyPair();

  await setSecureItem(PRIVATE_KEY_STORAGE_KEY, encodeBase64(keyPair.secretKey));
  await setSecureItem(PUBLIC_KEY_STORAGE_KEY, encodeBase64(keyPair.publicKey));
  console.log(`[KeyDebug] getOrCreateKeyPair: stored new keypair (pub=${encodeBase64(keyPair.publicKey).substring(0, 20)}...)`);

  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/** Get the stored public key as base64, or null if not generated yet */
export async function getPublicKeyBase64(): Promise<string | null> {
  return getSecureItem(PUBLIC_KEY_STORAGE_KEY);
}

/** Get the stored private key as Uint8Array, or null */
export async function getPrivateKey(): Promise<Uint8Array | null> {
  const stored = await getSecureItem(PRIVATE_KEY_STORAGE_KEY);
  if (!stored) return null;
  return decodeBase64(stored);
}

/** Delete stored keys (e.g., on logout) */
export async function clearKeys(): Promise<void> {
  await deleteSecureItem(PRIVATE_KEY_STORAGE_KEY);
  await deleteSecureItem(PUBLIC_KEY_STORAGE_KEY);
}

// ─── Server Keys Cache ───────────────────────────────────────────

/** Store a decrypted server key in secure storage */
export async function storeServerKey(serverId: number, serverKey: Uint8Array): Promise<void> {
  const b64 = encodeBase64(serverKey);
  console.log(`[KeyDebug] storeServerKey(${serverId}): storing ${b64.length} chars`);
  await setSecureItem(`server_key_${serverId}`, b64);
}

/** Get a cached server key from secure storage */
export async function getServerKey(serverId: number): Promise<Uint8Array | null> {
  const stored = await getSecureItem(`server_key_${serverId}`);
  if (!stored) {
    console.log(`[KeyDebug] getServerKey(${serverId}): not found in storage`);
    return null;
  }
  console.log(`[KeyDebug] getServerKey(${serverId}): found (${stored.length} chars)`);
  return decodeBase64(stored);
}

/** Clear a specific server key (e.g., when leaving) */
export async function clearServerKey(serverId: number): Promise<void> {
  await deleteSecureItem(`server_key_${serverId}`);
}
