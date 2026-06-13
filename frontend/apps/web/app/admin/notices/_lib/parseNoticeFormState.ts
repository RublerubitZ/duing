import type {
  CreateNoticePayload, NoticeCategory, NoticeClubScopeRole, NoticeContentFormat, NoticeVisibility, UpdateNoticePayload,
} from '@duing/types';

export type NoticeFormState = {
  title: string;
  summary: string;
  content: string;
  contentFormat: NoticeContentFormat;
  coverImageUrl: string;
  linkUrl: string;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  pinned: boolean;
  expiresAt: string | null;
  notifyOnPublish: boolean;
  eventStartAt: string;
  eventEndAt: string;
  location: string;
  host: string;
  audience: string;
};

export const EMPTY_NOTICE_FORM: NoticeFormState = {
  title: '',
  summary: '',
  content: '',
  contentFormat: 'HTML',
  coverImageUrl: '',
  linkUrl: '',
  category: 'GENERAL',
  tags: [],
  visibility: 'PUBLIC',
  clubScopeRole: null,
  targetClubIds: [],
  pinned: false,
  expiresAt: null,
  notifyOnPublish: false,
  eventStartAt: '',
  eventEndAt: '',
  location: '',
  host: '',
  audience: '',
};

function nullableTrimmed(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export function toCreatePayload(state: NoticeFormState): CreateNoticePayload {
  return {
    title: state.title.trim(),
    summary: state.summary.trim(),
    content: state.content,
    contentFormat: state.contentFormat,
    coverImageUrl: state.coverImageUrl,
    linkUrl: nullableTrimmed(state.linkUrl),
    category: state.category,
    tags: state.tags,
    visibility: state.visibility,
    clubScopeRole: state.visibility === 'CLUB_SCOPED' ? state.clubScopeRole : null,
    targetClubIds: state.visibility === 'CLUB_SCOPED' ? state.targetClubIds : [],
    pinned: state.pinned,
    expiresAt: state.expiresAt,
    notifyOnPublish: state.visibility === 'PUBLIC' ? state.notifyOnPublish : true,
    eventStartAt: state.eventStartAt === '' ? null : state.eventStartAt,
    eventEndAt: state.eventEndAt === '' ? null : state.eventEndAt,
    location: nullableTrimmed(state.location),
    host: nullableTrimmed(state.host),
    audience: nullableTrimmed(state.audience),
  };
}

export function toUpdatePayload(state: NoticeFormState): UpdateNoticePayload {
  const base = toCreatePayload(state);
  const allEventEmpty =
    state.eventStartAt === '' &&
    state.eventEndAt === '' &&
    state.location.trim() === '' &&
    state.host.trim() === '' &&
    state.audience.trim() === '';
  if (allEventEmpty) {
    return {
      ...base,
      eventStartAt: null,
      eventEndAt: null,
      location: null,
      host: null,
      audience: null,
      clearEvent: true,
    };
  }
  return base;
}
