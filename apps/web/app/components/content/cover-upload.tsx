import { useMutation } from '@tanstack/react-query';
import { ImageUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { COVER_UPLOAD } from '@upvine/shared';
import type { ContentDetailDto } from '@upvine/shared';
import { Button, Dialog, DialogContent, Field, Input } from '@upvine/ui';
import { api } from '../../lib/api';
import { useApiErrorToast } from '../../lib/sites';

/** Dosyanın piksel boyutu (tarayıcıda); okunamazsa null. */
function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Kapağı kullanıcının kendi görseliyle değiştirir: dosya + alt metin + önizleme. Sunucu oranı korur
 * (kırpmaz), en fazla 1600 px genişliğe küçültür ve WebP'ye çevirir.
 */
export function CoverUpload({ itemId, currentAlt, onSaved }: { itemId: string; currentAlt: string; onSaved: (d: ContentDetailDto) => void }) {
  const { t } = useTranslation('content');
  const onError = useApiErrorToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(currentAlt);
  const [fileError, setFileError] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const upload = useMutation({
    mutationFn: (input: { file: File; alt: string }) =>
      api<ContentDetailDto>(`/content/${itemId}/cover?alt=${encodeURIComponent(input.alt)}`, { method: 'PUT', body: input.file }),
    onSuccess: (d) => {
      onSaved(d);
      setOpen(false);
    },
    onError,
  });

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setFile(null);
    setPreview(null);
    setFileError(null);
    setAltError(null);
    setAlt(currentAlt);
  };

  const pick = async (picked: File | undefined) => {
    setFile(null);
    setPreview(null);
    setFileError(null);
    if (!picked) return;
    if (!(COVER_UPLOAD.mimeTypes as readonly string[]).includes(picked.type) || picked.size > COVER_UPLOAD.maxBytes) {
      setFileError(t('cover.invalid'));
      return;
    }
    const url = URL.createObjectURL(picked);
    const size = await imageSize(url);
    if (!size || size.width < COVER_UPLOAD.minWidth || size.height < COVER_UPLOAD.minHeight) {
      URL.revokeObjectURL(url);
      setFileError(t('cover.invalid'));
      return;
    }
    setFile(picked);
    setPreview(url);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = alt.trim();
    setAltError(text ? null : t('cover.altRequired'));
    if (!file) setFileError(t('cover.fileRequired'));
    if (!file || !text) return;
    upload.mutate({ file, alt: text });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => reset(true)}>
        <ImageUp aria-hidden />
        {t('cover.change')}
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent title={t('cover.title')} description={t('cover.description')}>
          <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t('cover.file')} hint={t('cover.fileHint')} error={fileError}>
              <Input
                type="file"
                accept={COVER_UPLOAD.mimeTypes.join(',')}
                className="py-2 file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:text-ink"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </Field>
            {preview ? <img src={preview} alt="" className="max-h-64 w-full rounded-card border border-border object-contain" /> : null}
            <Field label={t('cover.alt')} hint={t('cover.altHint')} error={altError}>
              <Input value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={upload.isPending}>
                {t('cover.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
