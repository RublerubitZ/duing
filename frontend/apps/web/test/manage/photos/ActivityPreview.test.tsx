import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClubHeroActivity, ClubPhoto } from '@duing/types';

import { ActivityPreview } from '../../../app/manage/clubs/[clubId]/photos/_components/ActivityPreview';

function makeHero(id: number): ClubHeroActivity {
  return {
    id,
    clubPhotoId: id * 10,
    storageKey: `key/${id}.jpg`,
    caption: null,
    width: null,
    height: null,
    title: `제목${id}`,
    description: `설명${id}`,
    displayOrder: id,
  };
}

function makePhoto(id: number): ClubPhoto {
  return { id, storageKey: `photo/${id}.jpg`, caption: null, width: null, height: null, displayOrder: id };
}

describe('ActivityPreview', () => {
  it('동아리명 헤더와 첫 대표 활동을 크게 보이고 dots 수를 hero 수와 맞춘다', () => {
    const heroes = [makeHero(1), makeHero(2), makeHero(3)];
    render(<ActivityPreview clubName="두잉 밴드부" heroActivities={heroes} photos={[]} />);

    expect(screen.getByText('두잉 밴드부')).toBeInTheDocument();
    // 첫 hero 만 크게 렌더 — 제목/설명 노출
    expect(screen.getByText('제목1')).toBeInTheDocument();
    expect(screen.getByText('설명1')).toBeInTheDocument();
    // Preview 는 학생 화면과 동일 — 번호 배지 없음(첫 hero displayOrder=1)
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    // dots 수 = hero 수
    expect(screen.getByTestId('preview-hero-dots').children).toHaveLength(3);
  });

  it('대표 활동이 없으면 빈 상태 문구를 보인다', () => {
    render(<ActivityPreview clubName="두잉 밴드부" heroActivities={[]} photos={[makePhoto(1)]} />);
    expect(screen.getByText('대표 활동을 등록하면 여기에 보여요')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-hero-dots')).not.toBeInTheDocument();
  });

  it('사진 그리드는 최대 6장·초과분은 +N 으로 표기한다', () => {
    const photos = Array.from({ length: 8 }, (_, index) => makePhoto(index + 1));
    render(<ActivityPreview clubName="두잉 밴드부" heroActivities={[makeHero(1)]} photos={photos} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
