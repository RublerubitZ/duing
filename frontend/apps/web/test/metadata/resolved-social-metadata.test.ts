// @vitest-environment node
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { Metadata, ResolvedMetadata } from 'next';
import { describe, expect, it } from 'vitest';

import { metadata as loginMetadata } from '@/app/(auth)/login/page';
import { SITE_URL } from '@/app/_lib/site';
import { metadata as clubsMetadata } from '@/app/clubs/page';
import { metadata as rootMetadata } from '@/app/layout';
import { metadata as noticesMetadata } from '@/app/notices/page';

// 공유 미리보기(og·twitter)의 제목·설명은 루트에 고정하지 않고 Next 가 페이지 title·description 으로 채우게 둔다.
// 그 채움(resolve-metadata.js 의 postProcessMetadata)은 문서에 없는 구현이라, Next 의 실제 해석기로 최종 값을 확인한다
// — 업그레이드로 동작이 바뀌거나 루트에 고정값이 다시 들어오면 여기서 실패한다.
const requireFromTest = createRequire(import.meta.url);
// Next dist 의 require('server-only') 를 Next 번들러와 같은 빈 모듈로 돌린다 — 일반 Node 에서 해석기를 부르기 위해.
const emptyServerOnlyUrl = pathToFileURL(requireFromTest.resolve('next/dist/compiled/server-only/empty.js')).href;
const serverOnlyRedirect = registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === 'server-only' ? { url: emptyServerOnlyUrl, shortCircuit: true } : nextResolve(specifier, context),
});

type AccumulateMetadata = (
  route: string,
  metadataItems: Array<[Metadata | null, null]>,
  pathname: Promise<string>,
  metadataContext: { trailingSlash: boolean; isStaticMetadataRouteFile: boolean },
) => Promise<ResolvedMetadata>;

function isAccumulateMetadata(value: unknown): value is AccumulateMetadata {
  return typeof value === 'function';
}

const resolveMetadataModule: unknown = requireFromTest('next/dist/lib/metadata/resolve-metadata.js');
// 훅은 모듈을 불러올 때만 필요하다 — 같은 워커의 다른 테스트 파일로 새지 않게 바로 푼다.
serverOnlyRedirect.deregister();
const accumulateMetadata =
  typeof resolveMetadataModule === 'object' &&
  resolveMetadataModule !== null &&
  'accumulateMetadata' in resolveMetadataModule &&
  isAccumulateMetadata(resolveMetadataModule.accumulateMetadata)
    ? resolveMetadataModule.accumulateMetadata
    : null;

async function resolveFor(pathname: string, pageMetadata: Metadata) {
  if (!accumulateMetadata) throw new Error('Next 메타데이터 해석기(accumulateMetadata)를 찾지 못했다');
  return accumulateMetadata(pathname, [[rootMetadata, null], [pageMetadata, null]], Promise.resolve(pathname), {
    trailingSlash: false,
    isStaticMetadataRouteFile: false,
  });
}

// 해석된 og 이미지는 타입상 문자열이거나 { url } 이다(병합 때 URL 이 문자열로 바뀐다).
function imageUrl(image: string | { url: string } | undefined): string | undefined {
  if (image === undefined) return undefined;
  return typeof image === 'string' ? image : image.url;
}

function socialSummary(resolved: ResolvedMetadata) {
  return {
    ogTitle: resolved.openGraph?.title?.absolute,
    ogDescription: resolved.openGraph?.description,
    ogUrl: resolved.openGraph?.url ?? null,
    ogSiteName: resolved.openGraph?.siteName,
    ogImage: imageUrl(resolved.openGraph?.images?.[0]),
    twitterCard: resolved.twitter?.card,
    twitterTitle: resolved.twitter?.title?.absolute,
    twitterDescription: resolved.twitter?.description,
  };
}

const SHARED_IMAGE = `${SITE_URL}/og-image-2026-09.png`;

describe('공유 미리보기 메타데이터 — 페이지 제목·설명이 og·twitter 로 이어진다', () => {
  it.each([
    ['/clubs', clubsMetadata],
    ['/notices', noticesMetadata],
    ['/login', loginMetadata],
  ])('%s 화면은 자기 제목·설명을 og·twitter 에 쓰고, og:url 은 홈을 가리키지 않는다', async (pathname, pageMetadata) => {
    const resolved = await resolveFor(pathname, pageMetadata);

    expect(typeof pageMetadata.title).toBe('string');
    expect(typeof pageMetadata.description).toBe('string');
    expect(socialSummary(resolved)).toEqual({
      ogTitle: pageMetadata.title,
      ogDescription: pageMetadata.description,
      ogUrl: null,
      ogSiteName: '두잉',
      ogImage: SHARED_IMAGE,
      twitterCard: 'summary_large_image',
      twitterTitle: pageMetadata.title,
      twitterDescription: pageMetadata.description,
    });
  });

  it('상세 페이지(generateMetadata 가 제목·설명·canonical 을 낸 경우)도 같은 규칙을 따른다', async () => {
    const detailMetadata: Metadata = {
      title: '모션케어 | 두잉',
      description: '재활·운동을 함께 공부하는 학술 동아리',
      alternates: { canonical: '/clubs/4' },
    };

    const resolved = await resolveFor('/clubs/4', detailMetadata);

    expect(socialSummary(resolved)).toMatchObject({
      ogTitle: '모션케어 | 두잉',
      ogDescription: '재활·운동을 함께 공부하는 학술 동아리',
      ogUrl: null,
      twitterTitle: '모션케어 | 두잉',
    });
  });

  it('자기 제목·설명이 없는 페이지는 사이트 기본값을 그대로 받는다', async () => {
    const resolved = await resolveFor('/page-without-own-metadata', {});

    expect(socialSummary(resolved)).toMatchObject({
      ogTitle: rootMetadata.title,
      ogDescription: rootMetadata.description,
      ogUrl: null,
      ogImage: SHARED_IMAGE,
      twitterCard: 'summary_large_image',
    });
  });
});
