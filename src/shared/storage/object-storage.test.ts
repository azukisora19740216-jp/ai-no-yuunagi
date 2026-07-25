import { describe, expect, it, vi } from "vitest";
import { createObjectStorageAdapter, uploadObjectAndRecord } from "./object-storage";

describe("disabled object storage", () => {
  it("ストレージ・DBの部分記録を残す前にアップロードを拒否する", async () => {
    const localUpload = vi.fn();
    const s3Upload = vi.fn();
    const recordMetadata = vi.fn();
    const storage = createObjectStorageAdapter(
      { STORAGE_DRIVER: "disabled" },
      {
        local: { upload: localUpload },
        s3: { upload: s3Upload },
      },
    );

    await expect(
      uploadObjectAndRecord(storage, recordMetadata, {
        key: "items/test/image.jpg",
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: "OBJECT_STORAGE_DISABLED",
      statusCode: 503,
    });

    expect(localUpload).not.toHaveBeenCalled();
    expect(s3Upload).not.toHaveBeenCalled();
    expect(recordMetadata).not.toHaveBeenCalled();
  });
});
