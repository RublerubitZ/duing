export const IMAGE_UPLOAD_POLICY = {
  maxBytes: 5 * 1024 * 1024,
  acceptedMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  acceptAttribute: 'image/jpeg,image/png,image/webp',
} as const;

export type AcceptedMime = (typeof IMAGE_UPLOAD_POLICY.acceptedMimes)[number];

export function validateImageFile(file: File): string | null {
  if (file.size > IMAGE_UPLOAD_POLICY.maxBytes) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  if (!IMAGE_UPLOAD_POLICY.acceptedMimes.includes(file.type as AcceptedMime)) {
    return 'JPG, PNG, WEBP만 업로드 가능합니다.';
  }
  return null;
}
