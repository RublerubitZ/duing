import type { FederationInquiryStatus } from '@duing/types';

type MyListFilters = { status?: FederationInquiryStatus; page: number; size: number };
type AdminListFilters = { status?: FederationInquiryStatus; keyword?: string; page: number; size: number };

export const federationInquiryQueryKeys = {
  all: ['federation-inquiries'] as const,
  my: (filters: MyListFilters) => ['federation-inquiries', 'my', filters] as const,
  detail: (inquiryId: number) => ['federation-inquiries', 'detail', inquiryId] as const,
  attachment: (inquiryId: number, attachmentId: number) =>
    ['federation-inquiries', 'attachment', inquiryId, attachmentId] as const,
  adminList: (filters: AdminListFilters) => ['federation-inquiries', 'admin', 'list', filters] as const,
  adminDetail: (inquiryId: number) => ['federation-inquiries', 'admin', 'detail', inquiryId] as const,
};
