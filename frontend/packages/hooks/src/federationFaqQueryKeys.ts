type ListFilters = { categoryId?: number; keyword?: string; page: number; size: number };
type AdminListFilters = {
  published?: boolean;
  categoryId?: number;
  keyword?: string;
  page: number;
  size: number;
};

export const federationFaqQueryKeys = {
  all: ['federation-faqs'] as const,
  list: (filters: ListFilters) => ['federation-faqs', 'list', filters] as const,
  detail: (faqId: number) => ['federation-faqs', 'detail', faqId] as const,
  categories: ['federation-faqs', 'categories'] as const,
  adminList: (filters: AdminListFilters) => ['federation-faqs', 'admin', 'list', filters] as const,
  adminSearchMisses: (filters: { page: number; size: number }) =>
    ['federation-faqs', 'admin', 'search-misses', filters] as const,
};
