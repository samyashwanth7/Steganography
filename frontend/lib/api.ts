/**
 * API helper functions for the Steganography backend.
 * All endpoints are proxied through Next.js rewrites to http://127.0.0.1:8000.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Steganography operations
// ---------------------------------------------------------------------------

/** Get the embedding capacity (in bytes) for a given cover media file. */
export async function getCapacity(file: File): Promise<number> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(apiUrl("/api/capacity"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`getCapacity failed: ${res.statusText}`);
  const data = await res.json();
  return data.capacity;
}

/** Encode a text message into a cover media file. Returns the stego file as a Blob. */
export async function encodeText(
  coverMedia: File,
  message: string,
  key: string
): Promise<Blob> {
  const form = new FormData();
  form.append("file", coverMedia);
  form.append("message", message);
  form.append("key", key);

  const res = await fetch(apiUrl("/api/encode/text"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`encodeText failed: ${res.statusText}`);
  return res.blob();
}

/** Encode a secret file into a cover media file. Returns the stego file as a Blob. */
export async function encodeFile(
  coverMedia: File,
  secretFile: File,
  key: string
): Promise<Blob> {
  const form = new FormData();
  form.append("file", coverMedia);
  form.append("secret_file", secretFile);
  form.append("key", key);

  const res = await fetch(apiUrl("/api/encode/file"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`encodeFile failed: ${res.statusText}`);
  return res.blob();
}

/** Decode hidden data from a stego media file using the provided key. */
export async function decode(
  media: File,
  key: string
): Promise<{
  type: "text" | "file";
  message?: string;
  filename?: string;
  data?: Blob;
}> {
  const form = new FormData();
  form.append("file", media);
  form.append("key", key);

  const res = await fetch(apiUrl("/api/decode"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`decode failed: ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";

  // If the response is JSON, the hidden data is text
  if (contentType.includes("application/json")) {
    const data = await res.json();
    return { type: "text", message: data.message };
  }

  // Otherwise the response is a file download
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
  const filename = filenameMatch?.[1] ?? "decoded_file";
  const blob = await res.blob();
  return { type: "file", filename, data: blob };
}

/** Decode multiple keys from a single stego file in batch. */
export async function decodeBatch(
  media: File,
  keys: string[]
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", media);
  form.append("media", media);
  form.append("keys", JSON.stringify(keys));

  const res = await fetch(apiUrl("/api/decode-batch"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`decodeBatch failed: ${res.statusText}`);
  return res.json();
}

/** Remove a hidden secret from a stego file. Returns the cleaned media as a Blob. */
export async function deleteSecret(media: File, key: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", media);
  form.append("key", key);

  const res = await fetch(apiUrl("/api/delete"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`deleteSecret failed: ${res.statusText}`);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Key utilities
// ---------------------------------------------------------------------------

/** Check the strength of a key / passphrase. */
export async function checkKeyStrength(
  key: string
): Promise<{ score: number; strength: string; suggestions: string[] }> {
  const res = await fetch(apiUrl("/api/key/check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) throw new Error(`checkKeyStrength failed: ${res.statusText}`);
  return res.json();
}

/** Generate a cryptographically strong random key. */
export async function generateKey(): Promise<string> {
  const res = await fetch(apiUrl("/api/key/generate"), { method: "POST" });
  if (!res.ok) throw new Error(`generateKey failed: ${res.statusText}`);
  const data = await res.json();
  return data.key;
}

// ---------------------------------------------------------------------------
// Library (authenticated)
// ---------------------------------------------------------------------------

/** Save a stego file to the user's library. */
export async function saveToLibrary(
  file: File,
  filename: string,
  token: string
): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  form.append("filename", filename);

  const res = await fetch(apiUrl("/api/library"), {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });

  if (!res.ok) throw new Error(`saveToLibrary failed: ${res.statusText}`);
  return res.json();
}

/** List all items in the user's library. */
export async function getLibrary(token: string): Promise<unknown[]> {
  const res = await fetch(apiUrl("/api/library"), {
    headers: authHeaders(token),
  });

  if (!res.ok) throw new Error(`getLibrary failed: ${res.statusText}`);
  return res.json();
}

/** Rename a library item. */
export async function renameLibraryItem(
  id: string,
  name: string,
  token: string
): Promise<unknown> {
  const res = await fetch(apiUrl(`/api/library/${id}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok)
    throw new Error(`renameLibraryItem failed: ${res.statusText}`);
  return res.json();
}

/** Delete a library item. */
export async function deleteLibraryItem(
  id: string,
  token: string
): Promise<unknown> {
  const res = await fetch(apiUrl(`/api/library/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!res.ok)
    throw new Error(`deleteLibraryItem failed: ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Inbox / messaging (authenticated)
// ---------------------------------------------------------------------------

/** Get all inbox messages for the current user. */
export async function getInbox(token: string): Promise<unknown[]> {
  const res = await fetch(apiUrl("/api/inbox"), {
    headers: authHeaders(token),
  });

  if (!res.ok) throw new Error(`getInbox failed: ${res.statusText}`);
  return res.json();
}

/** Send a stego file to one or more recipients. */
export async function sendFile(
  recipients: string[],
  filePath: string,
  token: string
): Promise<unknown> {
  const res = await fetch(apiUrl("/api/inbox/send"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ recipients, file_path: filePath }),
  });

  if (!res.ok) throw new Error(`sendFile failed: ${res.statusText}`);
  return res.json();
}

/** Delete an inbox message. */
export async function deleteInboxMessage(
  id: string,
  token: string
): Promise<unknown> {
  const res = await fetch(apiUrl(`/api/inbox/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!res.ok)
    throw new Error(`deleteInboxMessage failed: ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Admin (authenticated)
// ---------------------------------------------------------------------------

/** List all registered users (admin only). */
export async function getAdminUsers(token: string): Promise<unknown[]> {
  const res = await fetch(apiUrl("/api/admin/users"), {
    headers: authHeaders(token),
  });

  if (!res.ok) throw new Error(`getAdminUsers failed: ${res.statusText}`);
  return res.json();
}

/** Run steganography detection analysis on a file (admin only). */
export async function adminDetect(
  file: File,
  token: string
): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(apiUrl("/api/admin/detect"), {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });

  if (!res.ok) throw new Error(`adminDetect failed: ${res.statusText}`);
  return res.json();
}
