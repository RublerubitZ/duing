import type { ClubDetail, ClubPhoto } from '@duing/types';

import { activityScheduleLabel } from '../_lib/activeDaysLabel';
import { ClubDetailPhotos } from './ClubDetailPhotos';

type Props = { club: ClubDetail; photos: ClubPhoto[] };

export function ClubDetailActivity({ club, photos }: Props) {
  const schedule = activityScheduleLabel(club.activityFrequency, club.activeDays);
  return (
    <div>
      {schedule && (
        <p className="mb-8 text-[15.5px] text-charcoal">
          정기 활동: <span className="font-semibold">{schedule}</span>
        </p>
      )}
      <ClubDetailPhotos photos={photos} />
    </div>
  );
}
