import type { ServerEnv } from "@/shared/config/env";
import { AppError } from "@/shared/errors/app-error";

export type UploadObjectInput = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export type StoredObject = {
  key: string;
  storageReference: string;
};

export type ObjectStorageAdapter = {
  upload(input: UploadObjectInput): Promise<StoredObject>;
};

type StorageRuntime = Pick<ServerEnv, "STORAGE_DRIVER">;

export function createObjectStorageAdapter(
  env: StorageRuntime,
  adapters: {
    local?: ObjectStorageAdapter;
    s3?: ObjectStorageAdapter;
  } = {},
): ObjectStorageAdapter {
  if (env.STORAGE_DRIVER === "disabled") {
    return {
      async upload() {
        throw new AppError(
          "OBJECT_STORAGE_DISABLED",
          "ファイル保存が設定されていないため、アップロードできません。",
          503,
        );
      },
    };
  }

  const adapter = env.STORAGE_DRIVER === "local" ? adapters.local : adapters.s3;
  if (!adapter) {
    return {
      async upload() {
        throw new AppError(
          "OBJECT_STORAGE_ADAPTER_NOT_CONFIGURED",
          "ファイル保存アダプターが設定されていません。",
          503,
        );
      },
    };
  }
  return adapter;
}

export async function uploadObjectAndRecord(
  storage: ObjectStorageAdapter,
  recordMetadata: (stored: StoredObject) => Promise<void>,
  input: UploadObjectInput,
) {
  const stored = await storage.upload(input);
  await recordMetadata(stored);
  return stored;
}
