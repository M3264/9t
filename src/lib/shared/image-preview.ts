export const MAX_IMAGE_PREVIEW_BYTES = 2 * 1024 * 1024;

export function canPreviewImage(file: {
  mimeType?: string;
  sizeBytes?: number;
}): boolean {
  return (
    /^image\/(png|jpeg|gif|webp|avif)$/.test(file.mimeType || "") &&
    typeof file.sizeBytes === "number" &&
    file.sizeBytes > 0 &&
    file.sizeBytes <= MAX_IMAGE_PREVIEW_BYTES
  );
}
