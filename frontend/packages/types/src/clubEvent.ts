export type ClubEventCard = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
};

/**
 * 총동연 캘린더용 전 동아리 행사 카드. 학생용 {@link ClubEventCard} 에 출처 동아리를 더한 형태다
 * (전 동아리 집계라 어느 동아리 일정인지 표시해야 한다). 상세(설명·작성자)는 노출되지 않는다.
 */
export type AdminClubEventCard = ClubEventCard & {
  clubId: number;
  clubName: string;
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
