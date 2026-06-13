'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { marked } from 'marked';
import { useFileUploadMutation } from '@duing/hooks';
import type { NoticeContentFormat } from '@duing/types';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { sanitizeNoticeHtml } from '../../../notices/_lib/sanitizeHtml';

const MAX_INLINE_IMAGES = 20;

type Props = {
  value: string;
  format: NoticeContentFormat;
  onChange: (html: string) => void;
};

function toInitialHtml(value: string, format: NoticeContentFormat): string {
  if (!value) return '';
  if (format === 'MARKDOWN') {
    const parsed = marked(value, { async: false });
    const html = typeof parsed === 'string' ? parsed : '';
    return sanitizeNoticeHtml(html);
  }
  return sanitizeNoticeHtml(value);
}

function ToolbarButton({ active, disabled, onClick, label }: {
  active?: boolean; disabled?: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-[12px] font-semibold border border-line disabled:opacity-40 ${active ? 'bg-ink text-paper' : 'bg-paper text-charcoal-2 hover:border-ink'}`}
    >{label}</button>
  );
}

export function NoticeRichEditor({ value, format, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // StarterKit v3 bundles Link — configure it here instead of a separate extension
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: toInitialHtml(value, format),
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onCreate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  if (!editor) {
    return <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-charcoal-3">에디터 로딩 중…</div>;
  }

  const imageCount = (instance: Editor): number => {
    let count = 0;
    instance.state.doc.descendants((node) => { if (node.type.name === 'image') count += 1; });
    return count;
  };

  const handleImageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    for (const file of Array.from(fileList)) {
      if (imageCount(editor) >= MAX_INLINE_IMAGES) {
        setError(`본문 이미지는 최대 ${MAX_INLINE_IMAGES}장까지 넣을 수 있습니다.`);
        break;
      }
      const validationError = validateImageFile(file);
      if (validationError) { setError(validationError); continue; }
      try {
        // TODO(orphan-image-gc): 본문에서 제거되거나 공지 삭제 시 미참조 업로드를 정리하는 후속 작업 필요
        const result = await uploadMutation.mutateAsync({ file, purpose: 'NOTICE_BODY' });
        editor.chain().focus().setImage({ src: result.url }).run();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : '이미지 업로드에 실패했습니다.');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setLink = () => {
    const linkAttrs = editor.getAttributes('link');
    const previous = typeof linkAttrs.href === 'string' ? linkAttrs.href : undefined;
    const url = window.prompt('링크 URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="rounded-xl border border-line bg-paper">
      <div className="flex flex-wrap gap-1 border-b border-line p-2">
        <ToolbarButton label="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolbarButton label="목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="번호목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="인용" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton label="링크" active={editor.isActive('link')} onClick={setLink} />
        <ToolbarButton label="이미지" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} />
        <ToolbarButton label="실행취소" onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label="다시실행" onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent
        editor={editor}
        className="px-3.5 py-2.5 min-h-[260px] text-[14px] leading-relaxed [&_.ProseMirror]:outline-none [&_h2]:text-[18px] [&_h2]:font-bold [&_h3]:text-[15px] [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-charcoal-2"
      />
      <input
        ref={fileInputRef}
        data-testid="rich-editor-image-input"
        type="file"
        multiple
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        className="hidden"
        onChange={(changeEvent) => { void handleImageFiles(changeEvent.target.files); }}
      />
      <p className="px-3.5 pb-2 text-[11.5px] text-charcoal-3">이미지는 본문에 인라인 삽입됩니다 · 최대 {MAX_INLINE_IMAGES}장 · 파일당 5MB</p>
      {error && <p className="px-3.5 pb-2 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
