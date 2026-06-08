import { createClient } from "@supabase/supabase-js";

const ATTACHMENT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "task-attachments";

function storageClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase storage is not configured.");
  }

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function createSignedUploadUrl(path: string) {
  const { data, error } = await storageClient()
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create upload URL.");
  }

  return { uploadUrl: data.signedUrl, token: data.token, path: data.path };
}

export async function createSignedDownloadUrl(path: string, expiresInSeconds = 60) {
  const { data, error } = await storageClient()
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create download URL.");
  }

  return data.signedUrl;
}

export async function removeStorageObject(path: string) {
  const { error } = await storageClient().storage.from(ATTACHMENT_BUCKET).remove([path]);

  if (error) {
    throw new Error(error.message);
  }
}
