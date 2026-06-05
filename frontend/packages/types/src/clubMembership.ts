export type ClubMembershipRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type ClubActionPermissions = {
  canPostNotice: boolean;
  canEditNotice: boolean;
  canDeleteNotice: boolean;
  canPostEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
};

export type MyClubMembership = {
  role: ClubMembershipRole;
  joinedAt: string;
  permissions: ClubActionPermissions;
};
