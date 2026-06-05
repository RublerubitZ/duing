export type GlobalEventCategory =
  | 'FAIR'
  | 'FESTIVAL'
  | 'APPLICATION'
  | 'CONTEST'
  | 'UNION'
  | 'OTHER';

export type GlobalEventCard = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  category: GlobalEventCategory;
};

export type GlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  category: GlobalEventCategory;
};

export type AdminGlobalEventCreator = { id: number; name: string };

export type AdminGlobalEventSummary = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  category: GlobalEventCategory;
  createdById: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminGlobalEventDetail = {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  linkUrl: string | null;
  category: GlobalEventCategory;
  createdBy: AdminGlobalEventCreator;
  createdAt: string;
  updatedAt: string;
};

export type CreateGlobalEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  linkUrl?: string;
  category: GlobalEventCategory;
};

export type UpdateGlobalEventPayload = Partial<CreateGlobalEventPayload>;

export type GlobalEventListParams = {
  from?: string;
  to?: string;
  category?: GlobalEventCategory;
};

export type AdminGlobalEventListParams = {
  category?: GlobalEventCategory;
  keyword?: string;
  page: number;
  size: number;
};

export type GlobalEventCategoryStats = Record<GlobalEventCategory, number>;
