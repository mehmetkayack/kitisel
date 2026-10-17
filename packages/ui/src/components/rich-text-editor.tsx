import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2, Unlink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent } from './dialog';
import { Field } from './field';
import { Input } from './input';

export type { Editor } from '@tiptap/react';

export interface RichTextEditorProps {
  /** Başlangıç HTML'i (sonraki değişiklikler editörün kendi durumundadır) */
  initialHtml: string;
  onChange?: (html: string) => void;
  /** Editör hazır olunca (dış eylemler için: seçimi değiştirme, içerik ekleme) */
  onReady?: (editor: Editor) => void;
  /** Editör alanının erişilebilir adı */
  label: string;
  /** Araç çubuğunun sonuna eklenen uygulamaya özel eylemler (ör. yapay zekâyla yeniden yaz) */
  toolbarExtra?: ReactNode;
  className?: string;
}

function ToolButton({ icon: Icon, label, active, disabled, onClick }: { icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-control text-ink transition-colors duration-150',
        'hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40',
        active && 'bg-primary-soft text-primary',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * Makale editörü (Tiptap). Sadece yayınlanabilir HTML'e karşılık gelen biçimler: H2/H3, kalın, italik,
 * liste, alıntı, link, tablo. Görsel ve stil yok; çıktı sunucuda ayrıca temizlenir.
 */
export function RichTextEditor({ initialHtml, onChange, onReady, label, toolbarExtra, className }: RichTextEditorProps) {
  const { t } = useTranslation('common');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkFieldId = useId();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        // rel/target sunucuda belirlenir (dış link: noopener + yeni sekme)
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initialHtml,
    editorProps: { attributes: { class: 'article-body min-h-96 px-4 py-3 focus:outline-none', 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const openLink = () => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? 'https://');
    setLinkOpen(true);
  };
  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url || url === 'https://') chain.unsetLink().run();
    else if (/^(https?:\/\/|mailto:|\/)/i.test(url)) chain.setLink({ href: url }).run();
    setLinkOpen(false);
  };

  return (
    <div className={cn('flex flex-col rounded-card border border-border-strong bg-surface focus-within:border-primary', className)}>
      <div role="toolbar" aria-label={t('editor.toolbar')} className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-card border-b border-border bg-surface p-1">
        <ToolButton icon={Heading2} label={t('editor.h2')} active={state?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolButton icon={Heading3} label={t('editor.h3')} active={state?.h3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolButton icon={Bold} label={t('editor.bold')} active={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <ToolButton icon={Italic} label={t('editor.italic')} active={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <ToolButton icon={List} label={t('editor.bulletList')} active={state?.bullet} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolButton icon={ListOrdered} label={t('editor.orderedList')} active={state?.ordered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <ToolButton icon={Quote} label={t('editor.quote')} active={state?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
        <ToolButton icon={Link2} label={t('editor.link')} active={state?.link} onClick={openLink} />
        {state?.link ? <ToolButton icon={Unlink} label={t('editor.unlink')} onClick={() => editor?.chain().focus().unsetLink().run()} /> : null}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <ToolButton icon={Undo2} label={t('editor.undo')} disabled={!state?.canUndo} onClick={() => editor?.chain().focus().undo().run()} />
        <ToolButton icon={Redo2} label={t('editor.redo')} disabled={!state?.canRedo} onClick={() => editor?.chain().focus().redo().run()} />
        {toolbarExtra ? <div className="ml-auto flex items-center">{toolbarExtra}</div> : null}
      </div>
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-96" aria-hidden />}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent title={t('editor.linkTitle')} description={t('editor.linkBody')}>
          <form
            method="post"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              // Editör bir formun içinde olabilir: React submit olayı portal üzerinden dıştaki forma da ulaşır.
              e.preventDefault();
              e.stopPropagation();
              applyLink();
            }}
          >
            <Field label={t('editor.linkUrl')} id={linkFieldId}>
              <Input type="text" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t('actions.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit">{t('editor.linkApply')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
