import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SiteDto } from '@upvine/shared';
import { Button, Card, CardContent, Skeleton, toast } from '@upvine/ui';
import { BrandStep, CmsStep, LanguageStep, PublishingStep, ToneStep, TopicsStep, UrlStep } from '../../components/onboarding/steps';
import type { StepProps } from '../../components/onboarding/steps';
import { isWizardStep, WIZARD_STEPS } from '../../components/onboarding/wizard';
import type { WizardStep } from '../../components/onboarding/wizard';
import { useCurrentSite, useSiteMutations } from '../../lib/sites';

export function meta() {
  return [{ title: 'Upvine' }];
}

const STEP_COMPONENTS: Record<Exclude<WizardStep, 'url'>, (props: StepProps) => ReactNode> = {
  brand: BrandStep,
  language: LanguageStep,
  tone: ToneStep,
  topics: TopicsStep,
  cms: CmsStep,
  publishing: PublishingStep,
};

/** Kurulum bittiğinde: özet ve her adımı yeniden açma bağlantıları. */
function CompletedSummary({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-growth-soft text-growth-text">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('wizard.completedTitle')}</h1>
          <p className="measure text-ink-muted">{t('wizard.completedBody')}</p>
          <p className="text-sm break-all text-ink-muted">{site.url}</p>
        </div>
      </div>
      <Card>
        <CardContent className="py-1 sm:py-1">
          <ul>
            {WIZARD_STEPS.filter((s) => s !== 'url').map((step) => (
              <li key={step} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span className="text-ink">{t(`wizard.steps.${step}`)}</span>
                <Link to={`/app/onboarding?step=${step}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
                  {t('wizard.edit')}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div>
        <Button asChild>
          <Link to="/app">{t('wizard.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}

function SiteWizard({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { update } = useSiteMutations(site.id);
  const requested = params.get('step');
  const editing = site.onboardingCompleted;

  if (editing && !isWizardStep(requested)) return <CompletedSummary site={site} />;

  const stored = site.onboardingStep === 'done' ? 'publishing' : site.onboardingStep;
  const step: Exclude<WizardStep, 'url'> = isWizardStep(requested) && requested !== 'url' ? requested : stored;
  const index = WIZARD_STEPS.indexOf(step);

  const go = async (next: WizardStep | 'done') => {
    if (next === 'done') {
      toast.success(t('wizard.completedToast'));
      await navigate('/app');
      return;
    }
    // Kurulum bittikten sonra tek adım düzenleniyorsa kaydedip özete dön.
    if (editing) {
      setParams({});
      return;
    }
    if (next !== 'url') await update.mutateAsync({ onboardingStep: next });
    if (requested) setParams({});
  };

  const prev = WIZARD_STEPS[index - 1];
  const onBack = prev && prev !== 'url' ? () => void go(prev) : undefined;
  const Step = STEP_COMPONENTS[step];
  return <Step key={step} site={site} onNext={go} onBack={editing ? () => setParams({}) : onBack} />;
}

/** Onboarding sihirbazı (Bölüm 7.1): ilerleme sunucuda saklanır, kullanıcı kaldığı yerden devam eder. */
export default function OnboardingPage() {
  const { site, isPending } = useCurrentSite();
  if (isPending) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return site ? <SiteWizard site={site} /> : <UrlStep />;
}
