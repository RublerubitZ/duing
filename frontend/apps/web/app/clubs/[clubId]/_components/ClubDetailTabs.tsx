'use client';

import { useState } from 'react';

import type { ClubDetail, ClubPhoto, MyClubMembership } from '@duing/types';

import { TabIndicator } from '@/components/motion/TabIndicator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatClubFee } from '../../../_lib/clubFee';
import { activityScheduleLabel } from '../../_lib/activeDaysLabel';
import { ClubDetailAbout } from './ClubDetailAbout';
import { ClubDetailActivity } from './ClubDetailActivity';
import { ClubDetailActivityIntro } from './ClubDetailActivityIntro';
import { ClubDetailHeroActivities } from './ClubDetailHeroActivities';
import { ClubDetailInfoList } from './ClubDetailInfoList';
import { ClubDetailQna } from './ClubDetailQna';
import { ClubDetailNews } from './ClubDetailNews';

type TabKey = 'intro' | 'activity' | 'qna' | 'info' | 'news';

type Tab = { key: TabKey; label: string };

type Props = {
  club: ClubDetail;
  photos: ClubPhoto[];
  /** 해당 동아리에 가입한 경우의 멤버십. 멤버에게만 소식 탭을 노출한다. */
  membership?: MyClubMembership | null;
};

export function ClubDetailTabs({ club, photos, membership }: Props) {
  const hasIntro = club.description !== null
    || club.highlights.length > 0
    || club.projects.length > 0;
  const hasActivity = activityScheduleLabel(club.activityFrequency, club.activeDays) !== null
    || photos.length > 0;
  const hasQna = club.faqs.length > 0;
  const hasInfo = club.foundedYear !== null
    || club.cohortNumber !== null
    || formatClubFee(club.feeCycle, club.membershipFeeAmount) !== null
    || club.feeNote !== null
    || club.location !== null
    || club.contactPhone !== null
    || club.contactVisibility !== 'PUBLIC';

  // 가입한 멤버에게만 소식(공지+일정) 탭을 노출한다.
  const isMember = membership != null;

  const tabs: Tab[] = [];
  if (hasIntro) tabs.push({ key: 'intro', label: '소개' });
  if (hasActivity) tabs.push({ key: 'activity', label: '활동' });
  if (hasQna) tabs.push({ key: 'qna', label: 'Q&A' });
  if (hasInfo) tabs.push({ key: 'info', label: '동아리 상세정보' });
  if (isMember) tabs.push({ key: 'news', label: '동아리 소식' });

  const firstTab = tabs[0];
  // 인디케이터를 활성 트리거 안에만 그리려면 활성 key 를 알아야 한다(Radix 는 탭 컨텍스트를
  // export 하지 않는다) — 그래서 defaultValue 대신 controlled 로 둔다. 훅은 조기 반환보다
  // 위에 있어야 하므로 tabs 가 비어 있는 경우까지 포함해 여기서 초기화한다.
  const [selectedTab, setSelectedTab] = useState<TabKey>(firstTab?.key ?? 'intro');
  if (!firstTab) return null;

  // 탭 구성은 사진·멤버십이 늦게 도착하면 늘거나 준다. 저장된 선택값이 지금 목록에 없으면
  // 첫 탭으로 접는다 — 없는 값을 그대로 넘기면 활성 트리거도 패널도 없는 빈 화면이 된다
  // (defaultValue 는 마운트 시점에 한 번만 읽혀 이 경우가 없었다).
  const activeTab = tabs.some((tab) => tab.key === selectedTab) ? selectedTab : firstTab.key;

  return (
    <Tabs
      value={activeTab}
      // Radix 는 value 를 string 으로 넘긴다 — 단언 대신 지금 목록에서 찾아 좁힌다(없으면 무시).
      onValueChange={(value) => {
        const next = tabs.find((tab) => tab.key === value);
        if (next) setSelectedTab(next.key);
      }}
    >
      {/* 모바일에서 탭이 넘치면 가로 스크롤 — 래퍼가 overflow 를 맡는다.
          TabsList 는 w-max+min-w-full 로 평소엔 전체폭 레일, 넘칠 때만 콘텐츠폭. 데스크탑(md+)은 기존 그대로. */}
      <div className="mb-8 overflow-x-auto md:overflow-visible">
        <TabsList className="w-max min-w-full gap-5 md:gap-8">
          {tabs.map((tab) => (
            // 공용 TabsTrigger 의 활성 보더는 끄고(레이아웃용 투명 보더는 유지) 활성 표시는
            // 인디케이터가 맡는다 — 공용 tabs.tsx 는 그대로라 다른 화면은 영향이 없다.
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="relative shrink-0 data-[state=active]:border-transparent"
            >
              {tab.label}
              {tab.key === activeTab && <TabIndicator layoutId="club-detail-tab" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {hasIntro && (
        <TabsContent value="intro">
          <ClubDetailHeroActivities clubId={club.id} />
          <ClubDetailActivityIntro projects={club.projects} />
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
        <TabsContent value="news">
          <ClubDetailNews clubId={club.id} />
        </TabsContent>
      )}
    </Tabs>
  );
}
