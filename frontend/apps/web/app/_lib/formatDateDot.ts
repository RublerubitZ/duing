/**
 * 백엔드 ISO 타임스탬프를 YYYY.MM.DD 로 표기한다.
 * (MyInquiriesPage·InquiryDetailPage·SectionInquiries 3곳의 동일 사본을 통합한 앱 공용 헬퍼)
 */
export function formatDateDot(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
