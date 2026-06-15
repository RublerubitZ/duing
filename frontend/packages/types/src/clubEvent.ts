export type ClubEventCard = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
};

export type ClubEventCreator = { id: number; name: string };

export type ClubEventDetail = {
  id: number;
  clubId: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  createdBy: ClubEventCreator;
  createdAt: string;
  updatedAt: string;
};

export type CreateClubEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
};

export type UpdateClubEventPayload = Partial<CreateClubEventPayload>;

export type ClubEventListParams = {
  from?: string;
  to?: string;
};
