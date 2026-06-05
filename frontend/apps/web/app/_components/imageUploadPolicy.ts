export const IMAGE_UPLOAD_POLICY = {
  // 백엔드 FileUploadPolicy.MAX_BYTES 와 동기화. 변경 시 양쪽 모두 갱신.
  maxBytes: 5 * 1024 * 1024,
  acceptedMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  acceptAttribute: 'image/jpeg,image/png,image/webp',
} as const;

export type AcceptedMime = (typeof IMAGE_UPLOAD_POLICY.acceptedMimes)[number];

export function validateImageFile(file: File): string | null {
  if (file.size > IMAGE_UPLOAD_POLICY.maxBytes) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  if (!(IMAGE_UPLOAD_POLICY.acceptedMimes as readonly string[]).includes(file.type)) {
    return '지원하지 않는 이미지 형식입니다. (JPG, PNG, WEBP만 가능)';
  }
  return null;
}
