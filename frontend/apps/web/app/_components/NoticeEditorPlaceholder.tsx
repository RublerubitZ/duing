import { TextLinesSkeleton } from '@/components/loading/Skeleton';

// NoticeRichEditor 의 로딩 상태 공용 placeholder — 두 곳에서 반드시 같은 마크업을 쓴다.
// ① NoticeRichEditorLazy 의 dynamic loading 폴백, ② NoticeRichEditor 내부 초기화
// (immediatelyRender: false, editor === null) 분기. 마크업이 어긋나면 폴백→에디터 전환 시
// 깜빡임이 재발하므로 컴포넌트로 단일화하고, 내용은 공용 로딩 체계(TextLinesSkeleton)를 따른다.
// min-h 394px 는 로드 완료 후 에디터 프레임 높이 근사치(툴바 45 + 본문 min-h 320 + 안내문 27
// + 보더 2) — 지연 로드 동안 아래 폼 필드가 밀렸다 당겨지는 레이아웃 점프를 막는다.
export function NoticeEditorPlaceholder() {
  return (
    <div className="min-h-[394px] rounded-xl border border-line bg-paper px-3.5 py-2.5">
      <TextLinesSkeleton lines={3} label="에디터 불러오는 중" />
    </div>
  );
}
