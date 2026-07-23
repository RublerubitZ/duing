'use client';

import type { ClubDetail, ClubPhoto, MyClubMembership } from '@duing/types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatClubFee } from '../../../_lib/clubFee';
import { activityScheduleLabel } from '../../_lib/activeDaysLabel';
import { ClubDetailAbout } from './ClubDetailAbout';
import { ClubDetailActivity } from './ClubDetailActivity';
import { ClubDetailInfoList } from './ClubDetailInfoList';
import { ClubDetailQna } from './ClubDetailQna';
import { ClubDetailNotices } from './ClubDetailNotices';
import { ClubDetailEvents } from './ClubDetailEvents';

type TabKey = 'intro' | 'activity' | 'qna' | 'info' | 'notices' | 'events';

type Tab = { key: TabKey; label: string };

type Props = {
  club: ClubDetail;
  photos: ClubPhoto[];
  /** 해당 동아리에 가입한 경우의 멤버십. 멤버에게만 공지/일정 탭을 노출한다. */
  membership?: MyClubMembership | null;
};

export function ClubDetailTabs({ club, photos, membership }: Props) {
  const hasIntro = club.description !== null
    || club.highlights.length > 0;
  const hasActivity = activityScheduleLabel(club.activityFrequency, club.activeDays) !== null
    || photos.length > 0;
  const hasQna = club.faqs.length > 0;
  const hasInfo = club.foundedYear !== null
    || club.cohortNumber !== null
    || formatClubFee(club.feeCycle, club.membershipFeeAmount) !== null
    || club.location !== null
    || club.contactPhone !== null
    || club.contactVisibility !== 'PUBLIC';

  // 가입한 멤버에게만 공지/일정 탭을 노출한다.
  const isMember = membership != null;

  const tabs: Tab[] = [];
  if (hasIntro) tabs.push({ key: 'intro', label: '소개' });
  if (hasActivity) tabs.push({ key: 'activity', label: '활동' });
  if (hasQna) tabs.push({ key: 'qna', label: 'Q&A' });
  if (hasInfo) tabs.push({ key: 'info', label: '동아리 상세정보' });
  if (isMember) {
    tabs.push({ key: 'notices', label: '공지' });
    tabs.push({ key: 'events', label: '일정' });
  }

  const firstTab = tabs[0];
  if (!firstTab) return null;

  return (
    <Tabs defaultValue={firstTab.key}>
      {/* 모바일에서 탭이 넘치면 가로 스크롤 — 래퍼가 overflow 를 맡아 활성 탭 언더라인(-mb)의 세로 클립을 막는다.
          TabsList 는 w-max+min-w-full 로 평소엔 전체폭 레일, 넘칠 때만 콘텐츠폭. 데스크탑(md+)은 기존 그대로. */}
      <div className="mb-8 overflow-x-auto pb-px md:overflow-visible md:pb-0">
        <TabsList className="w-max min-w-full gap-5 md:gap-8">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="shrink-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {hasIntro && (
        <TabsContent value="intro">
          <ClubDetailAbout
            description={club.description}
            highlights={club.highlights}
          />
        </TabsContent>
      )}
      {hasActivity && (
        <TabsContent value="activity">
          <ClubDetailActivity club={club} photos={photos} />
        </TabsContent>
      )}
      {hasQna && (
        <TabsContent value="qna">
          <ClubDetailQna faqs={club.faqs} />
        </TabsContent>
      )}
      {hasInfo && (
        <TabsContent value="info">
          <ClubDetailInfoList club={club} />
        </TabsContent>
      )}
      {isMember && (
        <>
          <TabsContent value="notices">
            <ClubDetailNotices clubId={club.id} />
          </TabsContent>
          <TabsContent value="events">
            <ClubDetailEvents clubId={club.id} />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
