import { fireEvent, render } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useImageLoadFade } from '@/app/_lib/useImageLoadFade';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FADE_IN_CLASSES = ['opacity-100', 'transition-opacity', 'duration-200', 'ease-duing', 'motion-reduce:transition-none'];

function FadeProbe() {
  const fade = useImageLoadFade();
  return <img alt="probe" src="https://files.duings.com/cover.jpg" className={fade.className} {...fade.imageProps} />;
}

function probeImage(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector('img');
  if (!(image instanceof HTMLImageElement)) throw new Error('probe img 가 없다');
  return image;
}

// jsdom 은 이미지를 받지 않아 complete 가 환경에 따라 다르다 — 케이스마다 getter 를 고정해 판정 입력을 명시한다.
function stubImageComplete(complete: boolean) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(complete);
}

describe('useImageLoadFade — 클라이언트 이동으로 마운트한 미완료 이미지만 로드 완료 때 드러낸다(iOS 깜빡임 P0 §6.2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('하이드레이션 뒤 마운트 + 로드 전(complete=false)이면 투명으로 시작해 load 뒤 200ms 전이(등장 연출 이징)로 보인다', () => {
    stubImageComplete(false);
    const { container } = render(<FadeProbe />);
    const image = probeImage(container);
    expect(image).toHaveClass('opacity-0');
    expect(image).not.toHaveClass('opacity-100');

    fireEvent.load(image);
    expect(image).not.toHaveClass('opacity-0');
    expect(image).toHaveClass(...FADE_IN_CLASSES);
  });

  it('뒤로·앞으로 가기 마커(data-back-navigation)가 선 채 마운트하면 로드 전이어도 즉시 보인다 — 돌아온 화면에 연출을 붙이지 않는다', () => {
    stubImageComplete(false);
    document.documentElement.setAttribute('data-back-navigation', '');
    try {
      const { container } = render(<FadeProbe />);
      const image = probeImage(container);
      expect(image.className).toBe('');

      fireEvent.load(image);
      expect(image.className).toBe('');
    } finally {
      document.documentElement.removeAttribute('data-back-navigation');
    }
  });

  it('마운트 때 이미 complete(캐시 적중)면 숨기지 않고 즉시 보인다 — 전이 클래스도 없다', () => {
    stubImageComplete(true);
    const { container } = render(<FadeProbe />);
    const image = probeImage(container);
    expect(image.className).toBe('');

    fireEvent.load(image);
    expect(image.className).toBe('');
  });

  it('로드에 실패한 이미지는 투명으로 남지 않는다 — error 때 즉시 보인다', () => {
    stubImageComplete(false);
    const { container } = render(<FadeProbe />);
    const image = probeImage(container);
    expect(image).toHaveClass('opacity-0');

    fireEvent.error(image);
    expect(image.className).toBe('');
  });

  it('동작 줄이기 설정에서는 전이 없이 로드 즉시 보인다(motion-reduce:transition-none)', () => {
    stubImageComplete(false);
    const { container } = render(<FadeProbe />);
    const image = probeImage(container);

    fireEvent.load(image);
    expect(image).toHaveClass('motion-reduce:transition-none');
  });

  it('서버 HTML 과 하이드레이션 첫 렌더는 보이는 상태다 — 하이드레이션 뒤 다시 그려져도·load 가 와도 숨기지 않는다(첫 화면 LCP)', async () => {
    stubImageComplete(false);
    const serverHtml = renderToString(<FadeProbe />);
    expect(serverHtml).not.toContain('opacity-0');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const root = await act(async () => hydrateRoot(container, <FadeProbe />));
    try {
      const image = probeImage(container);
      // useHydrated 는 하이드레이션 뒤 true 로 다시 그린다 — 그래도 마운트 시점 판정(보임)이 유지돼야 한다.
      expect(image.className).toBe('');
      await act(async () => {
        fireEvent.load(image);
      });
      expect(image.className).toBe('');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
