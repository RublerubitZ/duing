'use client';

import { useState } from 'react';

import type { ClubDetail, ClubPhoto } from '@duing/types';

import { cn } from '../../../_lib/cn';
import { activityScheduleLabel } from '../_lib/activeDaysLabel';
import { ClubDetailAbout } from './ClubDetailAbout';
import { ClubDetailActivity } from './ClubDetailActivity';
import { ClubDetailInfoList } from './ClubDetailInfoList';
import { ClubDetailQna } from './ClubDetailQna';

type TabKey = 'intro' | 'activity' | 'qna' | 'info';

type Tab = { key: TabKey; label: string };

type Props = { club: ClubDetail; photos: ClubPhoto[] };

export function ClubDetailTabs({ club, photos }: Props) {
<<<<<<< HEAD
  const hasIntro = club.description !== null
    || club.tagline !== null
    || club.highlights.length > 0
    || club.majorProjects !== null;
=======
  const hasIntro = club.description !== null;
>>>>>>> origin/main
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
  const [active, setActive] = useState<TabKey | null>(
    firstTab ? firstTab.key : null,
  );

  if (tabs.length === 0) return null;

  return (
    <div>
      <div className="mb-8 flex gap-8 border-b border-line">
        {tabs.map((tab) => {
          const on = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                'border-b-[2.5px] px-0 py-3.5 text-[15px] font-semibold transition',
                on
                  ? 'border-ink text-ink'
                  : 'border-transparent text-charcoal-3 hover:text-charcoal',
              )}
              style={{ marginBottom: '-1.5px' }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

<<<<<<< HEAD
      {active === 'intro' && (
        <ClubDetailAbout
          description={club.description}
          tagline={club.tagline}
          highlights={club.highlights}
          majorProjects={club.majorProjects}
        />
      )}
=======
      {active === 'intro' && <ClubDetailAbout description={club.description} />}
>>>>>>> origin/main
      {active === 'activity' && <ClubDetailActivity club={club} photos={photos} />}
      {active === 'qna' && <ClubDetailQna faqs={club.faqs} />}
      {active === 'info' && <ClubDetailInfoList club={club} />}
    </div>
  );
}
