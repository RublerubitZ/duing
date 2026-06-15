'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AdminPromotionSummary,
  CreatePromotionPayload,
  PromotionLinkType,
  PromotionPalette,
  PromotionRenderMode,
  UpdatePromotionPayload,
} from '@duing/types';
import { ImageUploader } from '../../../_components/ImageUploader';
import { PALETTE_OPTIONS, PROMOTION_PALETTE } from '../../../_lib/promotionPalette';
import { ClubSelector } from './ClubSelector';
import { NoticeSelector } from './NoticeSelector';

type CreateMode = {
  mode: 'create';
  initialValues?: undefined;
  onSubmit: (payload: CreatePromotionPayload) => Promise<void>;
};

type EditMode = {
  mode: 'edit';
  initialValues: AdminPromotionSummary;
  onSubmit: (payload: UpdatePromotionPayload) => Promise<void>;
};

type Props = (CreateMode | EditMode) & {
  isSubmitting: boolean;
  errorMessage?: string | null;
};

type ScheduleMode = 'ALWAYS' | 'SCHEDULED';

type FormState = {
  title: string;
  bannerImageUrl: string;
  linkUrl: string;
  linkType: PromotionLinkType;
  noticeId: number | null;
  noticeTitle: string | null;
  clubId: number | null;
  clubName: string | null;
  active: boolean;
  displayOrder: string;
  palette: PromotionPalette;
  tag: string;
  subtitle: string;
  ctaLabel: string;
  emoji: string;
  scheduleMode: ScheduleMode;
  /** datetime-local 입력값 — "YYYY-MM-DDTHH:mm" 형식. 빈 문자열 = 미지정. */
  startAt: string;
  endAt: string;
  renderMode: PromotionRenderMode;
  imageAltText: string;
};

/**
 * 서버의 ISO 문자열 ("2026-06-01T09:00:00") 을 datetime-local input 이 받아들이는
 * "YYYY-MM-DDTHH:mm" 형식으로 자른다.
 */
function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function buildInitialState(initialValues?: AdminPromotionSummary): FormState {
  if (!initialValues) {
    return {
      title: '',
      bannerImageUrl: '',
      linkUrl: '',
      linkType: 'NONE',
      noticeId: null,
      noticeTitle: null,
      clubId: null,
      clubName: null,
      active: true,
      displayOrder: '0',
      palette: 'INK',
      tag: '',
      subtitle: '',
      ctaLabel: '',
      emoji: '',
      scheduleMode: 'ALWAYS',
      startAt: '',
      endAt: '',
      renderMode: 'SYSTEM_COMPOSED',
      imageAltText: '',
    };
  }
  const hasSchedule = initialValues.startAt !== null || initialValues.endAt !== null;
  return {
    title: initialValues.title,
    bannerImageUrl: initialValues.bannerImageUrl ?? '',
    linkUrl: initialValues.linkUrl ?? '',
    linkType: initialValues.linkType,
    noticeId: initialValues.notice?.id ?? null,
    noticeTitle: initialValues.notice?.title ?? null,
    clubId: initialValues.club?.id ?? null,
    clubName: initialValues.club?.name ?? null,
    active: initialValues.active,
    displayOrder: String(initialValues.displayOrder),
    palette: initialValues.palette,
    tag: initialValues.tag ?? '',
    subtitle: initialValues.subtitle ?? '',
    ctaLabel: initialValues.ctaLabel ?? '',
    emoji: initialValues.emoji ?? '',
    scheduleMode: hasSchedule ? 'SCHEDULED' : 'ALWAYS',
    startAt: toDateTimeLocalValue(initialValues.startAt),
    endAt: toDateTimeLocalValue(initialValues.endAt),
    renderMode: initialValues.renderMode,
    imageAltText: initialValues.imageAltText ?? '',
  };
}

export function AdminPromotionForm(props: Props) {
  const { mode, isSubmitting, errorMessage } = props;
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(mode === 'edit' ? props.initialValues : undefined),
  );

  // 권장 비율(1920×840, 16:7) 측정 — FULL_BLEED 모드에서만 경고 노출.
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!state.bannerImageUrl) {
      setImageDimensions(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setImageDimensions(null);
    img.src = state.bannerImageUrl;
  }, [state.bannerImageUrl]);

  const imageSizeWarning = (() => {
    if (state.renderMode !== 'FULL_BLEED_IMAGE') return null;
    if (!imageDimensions) return null;
    const { width, height } = imageDimensions;
    const shortSide = Math.min(width, height);
    const ratio = width / height;
    const targetRatio = 16 / 7;
    const tolerancePercent = 0.1;
    const ratioOff = Math.abs(ratio - targetRatio) / targetRatio > tolerancePercent;
    const tooSmall = shortSide < 840;
    if (!ratioOff && !tooSmall) return null;
    return '권장 사이즈(1920×840, 16:7) 와 다릅니다 — 모바일에서 이미지 일부가 잘릴 수 있습니다.';
  })();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  function handleLinkTypeChange(next: PromotionLinkType) {
    setState((prev) => ({
      ...prev,
      linkType: next,
      linkUrl: next === 'URL' ? prev.linkUrl : '',
      noticeId: next === 'NOTICE' ? prev.noticeId : null,
      noticeTitle: next === 'NOTICE' ? prev.noticeTitle : null,
      clubId: next === 'CLUB' ? prev.clubId : null,
      clubName: next === 'CLUB' ? prev.clubName : null,
    }));
  }

  const trimToNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const linkUrlValue = state.linkType === 'URL' ? trimToNull(state.linkUrl) : null;
    const noticeIdValue = state.linkType === 'NOTICE' ? state.noticeId : null;
    const clubIdValue = state.linkType === 'CLUB' ? state.clubId : null;
    const displayOrderValue = Number(state.displayOrder);
    const bannerImage = trimToNull(state.bannerImageUrl);
    const scheduledStart = state.scheduleMode === 'SCHEDULED' ? trimToNull(state.startAt) : null;
    const scheduledEnd = state.scheduleMode === 'SCHEDULED' ? trimToNull(state.endAt) : null;

    if (mode === 'create') {
      const payload: CreatePromotionPayload = {
        title: state.title,
        bannerImageUrl: bannerImage,
        linkUrl: linkUrlValue,
        noticeId: noticeIdValue,
        clubId: clubIdValue,
        active: state.active,
        displayOrder: displayOrderValue,
        palette: state.palette,
        tag: trimToNull(state.tag),
        subtitle: trimToNull(state.subtitle),
        ctaLabel: trimToNull(state.ctaLabel),
        emoji: trimToNull(state.emoji),
        startAt: scheduledStart,
        endAt: scheduledEnd,
        renderMode: state.renderMode,
        imageAltText: trimToNull(state.imageAltText),
      };
      await props.onSubmit(payload);
    } else {
      const initialValues = props.initialValues;

      const payload: UpdatePromotionPayload = {
        title: state.title,
        active: state.active,
        displayOrder: displayOrderValue,
        palette: state.palette,
      };

      // 이미지 — null 로 비우는 경우 clearBannerImageUrl, 값 있는 경우 그대로 보낸다.
      if (bannerImage === null) {
        if (initialValues.bannerImageUrl !== null) payload.clearBannerImageUrl = true;
      } else {
        payload.bannerImageUrl = bannerImage;
      }

      // linkUrl — linkType 이 URL 이 아닌 경우 항상 null 처리.
      if (linkUrlValue === null) {
        if (initialValues.linkUrl !== null) payload.clearLinkUrl = true;
      } else {
        payload.linkUrl = linkUrlValue;
      }

      // noticeId — linkType 이 NOTICE 가 아닌 경우 항상 null 처리.
      if (noticeIdValue === null) {
        if (initialValues.notice !== null) payload.clearNoticeId = true;
      } else {
        payload.noticeId = noticeIdValue;
      }

      // clubId — linkType 이 CLUB 이 아닌 경우 항상 null 처리.
      if (clubIdValue === null) {
        if (initialValues.club !== null) payload.clearClubId = true;
      } else {
        payload.clubId = clubIdValue;
      }

      // 텍스트 필드들 — 동일 패턴.
      assignOrClear(payload, 'tag', 'clearTag', state.tag, initialValues.tag);
      assignOrClear(payload, 'subtitle', 'clearSubtitle', state.subtitle, initialValues.subtitle);
      assignOrClear(payload, 'ctaLabel', 'clearCtaLabel', state.ctaLabel, initialValues.ctaLabel);
      assignOrClear(payload, 'emoji', 'clearEmoji', state.emoji, initialValues.emoji);
      assignOrClear(payload, 'imageAltText', 'clearImageAltText', state.imageAltText, initialValues.imageAltText);

      // 기간 — SCHEDULED 면 값을 보내고, ALWAYS 면 원래 값이 있던 경우만 clear 플래그.
      if (scheduledStart === null) {
        if (initialValues.startAt !== null) payload.clearStartAt = true;
      } else {
        payload.startAt = scheduledStart;
      }
      if (scheduledEnd === null) {
        if (initialValues.endAt !== null) payload.clearEndAt = true;
      } else {
        payload.endAt = scheduledEnd;
      }

      // renderMode 는 항상 명시적으로 전송 — 백엔드는 null=변경 안 함이지만 폼 state 에는 항상 값이 있다.
      payload.renderMode = state.renderMode;

      await props.onSubmit(payload);
    }
  };

  const previewStyle = PROMOTION_PALETTE[state.palette];
  const hasBannerImage = state.bannerImageUrl.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 배너 유형 (모드 선택) — 가장 먼저 결정해야 다른 필드 의미가 정해진다. */}
      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">배너 유형</span>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <label className="inline-flex items-start gap-2">
            <input
              type="radio"
              name="renderMode"
              checked={state.renderMode === 'SYSTEM_COMPOSED'}
              onChange={() => update('renderMode', 'SYSTEM_COMPOSED')}
              className="mt-1"
            />
            <div>
              <div className="font-semibold">시스템 조합형</div>
              <div className="text-charcoal-3 text-[12px]">제목/부제목/CTA/팔레트를 자동 조합해 렌더링합니다.</div>
            </div>
          </label>
          <label className="inline-flex items-start gap-2">
            <input
              type="radio"
              name="renderMode"
              checked={state.renderMode === 'FULL_BLEED_IMAGE'}
              onChange={() => update('renderMode', 'FULL_BLEED_IMAGE')}
              className="mt-1"
            />
            <div>
              <div className="font-semibold">완성 이미지형</div>
              <div className="text-charcoal-3 text-[12px]">업로드한 이미지를 가공 없이 그대로 노출합니다 (포스터/홍보물).</div>
            </div>
          </label>
        </div>
      </div>

      {/* FULL_BLEED 전환 가드 — 필수 필드가 비어 있을 때 인라인 경고 (저장은 백엔드 422 로 차단). */}
      {state.renderMode === 'FULL_BLEED_IMAGE' && state.bannerImageUrl.trim() === '' && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
          완성 이미지형으로 전환하려면 배너 이미지 업로드가 필요합니다.
        </p>
      )}
      {state.renderMode === 'FULL_BLEED_IMAGE' && state.imageAltText.trim() === '' && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
          완성 이미지형으로 전환하려면 Alt Text 입력이 필요합니다.
        </p>
      )}

      <Field label="제목 (≤120자)">
        <input
          type="text"
          maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
        {state.renderMode === 'FULL_BLEED_IMAGE' && (
          <p className="mt-1 text-[12px] text-charcoal-3">
            관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.
          </p>
        )}
      </Field>

      {state.renderMode !== 'FULL_BLEED_IMAGE' && (
        <>
          <Field label="태그 (선택, ≤60자) — 예: EVENT · 9.25 — 9.27">
            <input
              type="text"
              maxLength={60}
              value={state.tag}
              onChange={(event) => update('tag', event.target.value)}
              placeholder="EVENT · 9.25 — 9.27"
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </Field>

          <Field label="부제 (선택, ≤200자)">
            <input
              type="text"
              maxLength={200}
              value={state.subtitle}
              onChange={(event) => update('subtitle', event.target.value)}
              placeholder="67개 동아리 · 80개 부스 · 중앙광장"
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CTA 라벨 (선택, ≤40자)">
              <input
                type="text"
                maxLength={40}
                value={state.ctaLabel}
                onChange={(event) => update('ctaLabel', event.target.value)}
                placeholder="박람회 자세히 보기"
                className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
              />
            </Field>
            <Field label="이모지 (선택, 1자 권장)">
              <input
                type="text"
                maxLength={8}
                value={state.emoji}
                onChange={(event) => update('emoji', event.target.value)}
                placeholder="🍂"
                className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
              />
            </Field>
          </div>
        </>
      )}

      <div>
        <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">배너 이미지 (선택)</span>
        <ImageUploader
          value={state.bannerImageUrl}
          onChange={(url) => update('bannerImageUrl', url)}
          purpose="PROMOTION_BANNER"
          placeholder="배너 이미지를 업로드하세요"
          altText="배너 이미지"
        />
        <p className="mt-1 text-[12px] text-charcoal-3">
          {hasBannerImage
            ? '이미지가 등록되어 팔레트 선택은 생략됩니다.'
            : '이미지 없이 텍스트+팔레트만으로도 배너 등록이 가능합니다.'}
        </p>
        {imageSizeWarning && (
          <p className="mt-1 text-[12px] text-amber-600">
            {imageSizeWarning}
          </p>
        )}
      </div>

      {/* Alt Text — 완성 이미지형에서는 필수, 시스템 조합형에서는 보존만 (입력 UI 는 항상 유지). */}
      <Field label={`Alt Text ${state.renderMode === 'FULL_BLEED_IMAGE' ? '(필수)' : '(선택)'}`}>
        <input
          type="text"
          maxLength={200}
          value={state.imageAltText}
          onChange={(event) => update('imageAltText', event.target.value)}
          placeholder="2026 AI 학과 해커톤 참가자 모집"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
        <p className="mt-1 text-[12px] text-charcoal-3">
          이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.
        </p>
      </Field>

      {!hasBannerImage && (
        <div>
          <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">팔레트 (필수)</span>
          <div className="grid grid-cols-3 gap-2">
            {PALETTE_OPTIONS.map((option) => {
              const style = PROMOTION_PALETTE[option.value];
              const selected = state.palette === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update('palette', option.value)}
                  className={`relative h-14 rounded-md border-2 px-3 text-left text-[12px] font-semibold transition-colors ${selected ? 'border-ink' : 'border-line hover:border-charcoal-3'}`}
                  style={{ background: style.bg, color: style.fg }}
                >
                  {option.label}
                  {selected && (
                    <span className="absolute top-1 right-1.5 text-[10px] font-bold">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 연결 대상 라디오 */}
      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">연결 대상</span>
        <div className="flex flex-col gap-2 text-[13.5px]">
          {([
            { type: 'NONE' as const, label: '연결 안 함 — 클릭 불가 배너' },
            { type: 'URL' as const, label: '외부/내부 URL' },
            { type: 'NOTICE' as const, label: '공지 연결' },
            { type: 'CLUB' as const, label: '동아리 연결' },
          ]).map(({ type, label }) => (
            <label key={type} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="linkType"
                checked={state.linkType === type}
                onChange={() => handleLinkTypeChange(type)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* URL 입력 */}
      {state.linkType === 'URL' && (
        <Field label="링크 URL (≤2000자)">
          <input
            type="url"
            maxLength={2000}
            value={state.linkUrl}
            onChange={(event) => update('linkUrl', event.target.value)}
            placeholder="https://..."
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
      )}

      {/* 공지 선택 + 비공개/삭제 경고 */}
      {state.linkType === 'NOTICE' && (
        <Field label="공지 선택">
          <NoticeSelector
            selectedNoticeId={state.noticeId}
            selectedNoticeTitle={state.noticeTitle}
            onSelect={(noticeId, noticeTitle) => setState((prev) => ({ ...prev, noticeId, noticeTitle }))}
            onClear={() => setState((prev) => ({ ...prev, noticeId: null, noticeTitle: null }))}
          />
          {mode === 'edit'
            && state.linkType === 'NOTICE'
            && state.noticeId !== null
            && props.initialValues.notice?.id === state.noticeId
            && props.initialValues.notice?.isAccessible === false && (
              <p className="mt-1 text-[12px] text-amber-600">
                연결된 공지가 비공개/삭제 상태입니다. 다시 선택하거나 다른 연결을 골라주세요.
              </p>
          )}
        </Field>
      )}

      {/* 동아리 선택 */}
      {state.linkType === 'CLUB' && (
        <Field label="동아리 선택">
          <ClubSelector
            selectedClubId={state.clubId}
            selectedClubName={state.clubName}
            onSelect={(clubId, clubName) => setState((prev) => ({ ...prev, clubId, clubName }))}
            onClear={() => setState((prev) => ({ ...prev, clubId: null, clubName: null }))}
          />
        </Field>
      )}

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.active}
            onChange={(event) => update('active', event.target.checked)}
          />
          활성 (배너 노출)
        </label>
      </div>

      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">노출 기간</span>
        <div className="flex items-center gap-5 text-[13.5px]">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={state.scheduleMode === 'ALWAYS'}
              onChange={() => update('scheduleMode', 'ALWAYS')}
            />
            상시 노출
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={state.scheduleMode === 'SCHEDULED'}
              onChange={() => update('scheduleMode', 'SCHEDULED')}
            />
            기간 노출
          </label>
        </div>
        {state.scheduleMode === 'SCHEDULED' && (
          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[12px] font-semibold text-charcoal-3 mb-1">시작</span>
              <input
                type="datetime-local"
                value={state.startAt}
                onChange={(event) => update('startAt', event.target.value)}
                className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-charcoal-3 mb-1">종료</span>
              <input
                type="datetime-local"
                value={state.endAt}
                onChange={(event) => update('endAt', event.target.value)}
                className="w-full px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
              />
            </label>
            <p className="col-span-1 text-[12px] text-charcoal-3 sm:col-span-2">
              한쪽만 비워두면 그 방향은 상시(시작 미지정=즉시 / 종료 미지정=만료 없음) 처리됩니다.
            </p>
          </div>
        )}
      </div>

      <Field label="노출 순서 (숫자가 작을수록 앞에 표시)">
        <input
          type="number"
          min={0}
          value={state.displayOrder}
          onChange={(event) => update('displayOrder', event.target.value)}
          required
          className="w-32 px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      {/* 라이브 미리보기 — 모드별 분기 */}
      <div>
        <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">미리보기</span>
        {state.renderMode === 'FULL_BLEED_IMAGE' ? (
          <div className="relative h-[200px] overflow-hidden rounded-xl bg-graysoft">
            {state.bannerImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 회색 배경이 그대로 노출되도록 onError 에서 숨김.
              <img
                src={state.bannerImageUrl}
                alt={state.imageAltText || ''}
                className="block h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-charcoal-3 text-[13px]">
                배너 이미지를 업로드해주세요
              </div>
            )}
            {state.bannerImageUrl && state.imageAltText.trim() === '' && (
              <span className="absolute right-2 top-2 rounded bg-coral/90 px-2 py-1 text-[11px] font-bold text-paper">
                ⚠ Alt 미입력
              </span>
            )}
          </div>
        ) : (
          <div
            className="relative flex h-[200px] flex-col justify-between overflow-hidden rounded-xl px-8 py-7"
            style={{
              background: previewStyle.bg,
              color: hasBannerImage ? '#fff' : previewStyle.fg,
            }}
          >
            {hasBannerImage && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 팔레트 색만 노출되도록 onError 에서 숨김. */}
                <img
                  src={state.bannerImageUrl}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'rgba(0,0,0,0.22)' }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }}
                />
              </>
            )}
            {state.emoji && (
              <div
                className="pointer-events-none absolute -right-2 -top-3 text-[140px] leading-none opacity-[0.18]"
                style={{ transform: 'rotate(-12deg)' }}
              >
                {state.emoji}
              </div>
            )}
            {state.tag && (
              <div
                className="relative inline-flex items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold"
                style={{
                  background: hasBannerImage ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.14)',
                  color: hasBannerImage ? '#143025' : previewStyle.accent,
                }}
              >
                {state.tag}
              </div>
            )}
            <div className="relative">
              <div className="text-[26px] font-bold leading-tight">{state.title || '제목 미리보기'}</div>
              {state.subtitle && (
                <div className="mt-1.5 text-[13px] opacity-85">{state.subtitle}</div>
              )}
              {state.ctaLabel && (
                <div
                  className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12px] font-bold"
                  style={{
                    background: hasBannerImage ? '#9DB6A0' : previewStyle.accent,
                    color: hasBannerImage ? '#143025' : '#fff',
                  }}
                >
                  {state.ctaLabel} →
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[13px] text-coral">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? '저장 중…' : mode === 'create' ? '배너 등록' : '수정 저장'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/**
 * 텍스트 필드의 PATCH 페이로드 빌더 — 값이 비워졌고 원래 값이 있었다면 clear 플래그를,
 * 값이 있다면 그대로 보낸다. 값이 양쪽 모두 비어 있으면 아무것도 보내지 않는다.
 */
function assignOrClear<
  K extends 'tag' | 'subtitle' | 'ctaLabel' | 'emoji' | 'imageAltText',
  C extends 'clearTag' | 'clearSubtitle' | 'clearCtaLabel' | 'clearEmoji' | 'clearImageAltText',
>(
  payload: UpdatePromotionPayload,
  field: K,
  clearFlag: C,
  nextRaw: string,
  initial: string | null,
) {
  const next = nextRaw.trim();
  if (next.length === 0) {
    if (initial !== null) {
      (payload as Record<string, unknown>)[clearFlag] = true;
    }
    return;
  }
  (payload as Record<string, unknown>)[field] = next;
}
