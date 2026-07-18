'use client';

import dynamic from 'next/dynamic';
import { NoticeEditorPlaceholder } from './NoticeEditorPlaceholder';

// Tiptap(+marked·dompurify) 번들(라우트당 초기 JS 약 +160 kB)을 에디터가 실제 렌더되는 시점까지
// 지연 로드한다. NoticeRichEditor 는 immediatelyRender: false 라 로드 후에도 같은 placeholder 를
// 한 번 더 거치므로, 동일 마크업의 loading 폴백이면 전환 시 가시적 변화가 없다.
// SSR 제외(ssr: false)도 동일 이유로 안전하다 — 서버에서는 원래 placeholder 만 렌더됐다.
export const NoticeRichEditorLazy = dynamic(
  () => import('./NoticeRichEditor').then((editorModule) => editorModule.NoticeRichEditor),
  {
    ssr: false,
    loading: () => <NoticeEditorPlaceholder />,
  },
);
