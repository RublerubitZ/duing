'use client';

import type { ClubDetail, ClubPhoto } from '@duing/types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { activityScheduleLabel } from '../../_lib/activeDaysLabel';
import { ClubDetailAbout } from './ClubDetailAbout';
import { ClubDetailActivity } from './ClubDetailActivity';
import { ClubDetailInfoList } from './ClubDetailInfoList';
import { ClubDetailQna } from './ClubDetailQna';

type TabKey = 'intro' | 'activity' | 'qna' | 'info';

type Tab = { key: TabKey; label: string };

type Props = { club: ClubDetail; photos: ClubPhoto[] };

export function ClubDetailTabs({ club, photos }: Props) {
  const hasIntro = club.description !== null
    || club.tagline !== null
    || club.highlights.length > 0
    || club.majorProjects !== null;
  const hasActivity = activityScheduleLabel(club.activityFrequency, club.activeDays) !== null
    || photos.length > 0;
  const hasQna = club.faqs.length > 0;
  const hasInfo = club.foundedYear !== null
    || club.cohortNumber !== null
    || club.membershipFee !== null
    || club.location !== null
    || club.contactEmail !== null;

  const tabs: Tab[] = [];
  if (hasIntro) tabs.push({ key: 'intro', label: '소개' });
  if (hasActivity) tabs.push({ key: 'activity', label: '활동' });
  if (hasQna) tabs.push({ key: 'qna', label: 'Q&A' });
  if (hasInfo) tabs.push({ key: 'info', label: '동아리 상세정보' });

  const firstTab = tabs[0];
  if (!firstTab) return null;

  return (
    <Tabs defaultValue={firstTab.key}>
      <TabsList className="mb-8">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {hasIntro && (
        <TabsContent value="intro">
          <ClubDetailAbout
            description={club.description}
            tagline={club.tagline}
            highlights={club.highlights}
            majorProjects={club.majorProjects}
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
    </Tabs>
  );
}
