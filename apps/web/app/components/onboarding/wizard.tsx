import { ArrowLeft } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@upvine/ui';

/** Sihirbaz adımları (Bölüm 7.1). Ödeme adımı Faz 3'te eklenecek. */
export const WIZARD_STEPS = ['url', 'brand', 'language', 'tone', 'topics', 'cms', 'publishing'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function isWizardStep(value: string | null): value is WizardStep {
  return !!value && (WIZARD_STEPS as readonly string[]).includes(value);
}

/** Her adım tek ekran, üstte ilerleme çubuğu. */
export function WizardFrame({
  step,
  title,
  description,
  onBack,
  children,
}: {
  step: WizardStep;
  title: ReactNode;
  description?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('sites');
  const labelId = useId();
  const index = WIZARD_STEPS.indexOf(step);
  const total = WIZARD_STEPS.length;
  const progress = t('wizard.progress', { current: index + 1, total });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span id={labelId} className="font-medium text-ink-muted tabular-nums">
            {progress} · {t(`wizard.steps.${step}`)}
          </span>
          {onBack ? (
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft aria-hidden />
              {t('wizard.back')}
            </Button>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={progress}
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-250 ease-out" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="measure text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Adımın altındaki eylem satırı: tek ana buton (Bölüm 6.5 madde 2). */
export function StepActions({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>
      {hint ? <p className="text-right text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}
