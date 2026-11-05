import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { useAuth } from '../lib/auth/auth-context';
import {
  INTEGRATION_GUIDE_STEPS,
  type GuideIconName,
  type GuideSection,
  type GuideStep,
} from '../lib/onboarding/integration-guide-content';
import {
  countCheckedItems,
  createEmptyProgress,
  getCompletionPercent,
  getIntegrationGuideStorageKey,
  goToStep,
  isGuideComplete,
  isStepCompleted,
  loadProgress,
  saveProgress,
  setStepCompleted,
  toggleChecklistItem,
  type IntegrationGuideProgress,
} from '../lib/onboarding/integration-guide-progress';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Renders `code` and **bold** markers used in the guide content. */
export function renderInline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/u)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="ig-code">
            {part.slice(1, -1)}
          </code>
        );
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      return part;
    });
}

const ICON_PATHS: Record<GuideIconName | 'check' | 'shield' | 'alert' | 'chevron' | 'arrowLeft' | 'arrowRight' | 'sparkle', string[]> = {
  install: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  connect: [
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 4.5 2',
    'm16 18 2 2 4-4',
  ],
  project: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 10h18'],
  snapshot: ['M16 16l-4-4-4 4', 'M12 12v9', 'M20.4 18.4A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.3'],
  view: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  check: ['m5 12 5 5L20 7'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  alert: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17h.01'],
  chevron: ['m9 6 6 6-6 6'],
  arrowLeft: ['M19 12H5', 'm12 19-7-7 7-7'],
  arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
  sparkle: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm6 6 2 2', 'm16 16 2 2', 'm6 18 2-2', 'm16 8 2-2'],
};

function GuideIcon({ name, className = '' }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return (
    <svg
      className={`ig-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function GuideSectionPanel({ section }: { section: GuideSection }) {
  const tone = section.tone ?? 'default';
  const icon = tone === 'vault' ? 'shield' : tone === 'warning' ? 'alert' : null;

  return (
    <details className={`ig-section ig-section-${tone}`}>
      <summary className="ig-section-summary">
        <span className="ig-section-title">
          {icon ? <GuideIcon name={icon} className="ig-section-icon" /> : null}
          {section.title}
        </span>
        <GuideIcon name="chevron" className="ig-section-chevron" />
      </summary>
      <div className="ig-section-body body-sm">
        {section.paragraphs?.map((paragraph) => <p key={paragraph}>{renderInline(paragraph)}</p>)}
        {section.chips ? (
          <ul className="ig-chips" aria-label={section.title}>
            {section.chips.map((chip) => (
              <li key={chip} className="ig-chip">
                {chip}
              </li>
            ))}
          </ul>
        ) : null}
        {section.bullets ? (
          <ul className="ig-bullets">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{renderInline(bullet)}</li>
            ))}
          </ul>
        ) : null}
        {section.troubleshooting ? (
          <dl className="ig-troubleshooting">
            {section.troubleshooting.map((item) => (
              <div key={item.problem} className="ig-trouble-item">
                <dt>{item.problem}</dt>
                <dd className="muted">{item.solution}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

type IntegrationGuideProps = {
  storageKey: string;
  storage: StorageLike | null;
  steps?: GuideStep[];
};

export function IntegrationGuide({ storageKey, storage, steps = INTEGRATION_GUIDE_STEPS }: IntegrationGuideProps) {
  // Progress is stored together with its key so a user switch can never save one user's progress under another key.
  const [state, setState] = useState<{ key: string; progress: IntegrationGuideProgress }>(() => ({
    key: storageKey,
    progress: loadProgress(storage, storageKey, steps),
  }));
  const [isReviewing, setIsReviewing] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusHeadingRef = useRef(false);

  if (state.key !== storageKey) {
    setState({ key: storageKey, progress: loadProgress(storage, storageKey, steps) });
    setIsReviewing(false);
  }

  const progress = state.key === storageKey ? state.progress : createEmptyProgress();
  const setProgress = (update: (current: IntegrationGuideProgress) => IntegrationGuideProgress) => {
    setState((current) => ({ key: current.key, progress: update(current.progress) }));
  };

  useEffect(() => {
    saveProgress(storage, state.key, state.progress);
  }, [state, storage]);

  const activeIndex = progress.activeStepIndex;
  const activeStep = steps[activeIndex] ?? steps[0];
  const completedCount = useMemo(
    () => steps.filter((step) => isStepCompleted(progress, step.id)).length,
    [progress, steps],
  );
  const percent = getCompletionPercent(progress, steps);
  const allComplete = isGuideComplete(progress, steps);
  const showCompletion = allComplete && !isReviewing;

  useEffect(() => {
    if (shouldFocusHeadingRef.current) {
      shouldFocusHeadingRef.current = false;
      stepHeadingRef.current?.focus();
    }
  }, [activeIndex, showCompletion]);

  if (!activeStep) {
    return null;
  }

  const navigateTo = (index: number) => {
    shouldFocusHeadingRef.current = true;
    setIsReviewing(true);
    setProgress((current) => goToStep(current, index, steps.length));
  };

  const activeStepCompleted = isStepCompleted(progress, activeStep.id);
  const checkedCount = countCheckedItems(progress, activeStep);
  const isLastStep = activeIndex === steps.length - 1;

  const onToggleStepCompleted = () => {
    const nextCompleted = !activeStepCompleted;
    setProgress((current) => {
      const updated = setStepCompleted(current, activeStep, nextCompleted);
      // Completing a step moves the user forward; the final step reveals the completion state.
      return nextCompleted && !isLastStep ? goToStep(updated, activeIndex + 1, steps.length) : updated;
    });

    if (nextCompleted) {
      shouldFocusHeadingRef.current = true;
      setIsReviewing(false);
    }
  };

  return (
    <div className="ig">
      <section className="card ig-hero">
        <div className="ig-hero-text">
          <div className="eyebrow">Getting started</div>
          <h2 className="ig-title">Integration Guide</h2>
          <p className="muted ig-subtitle">
            Your journey from VS Code to your OCTOPUS dashboard, in five simple steps.
          </p>
        </div>
        <div className="ig-hero-progress" aria-live="polite">
          <span className="ig-hero-count">
            {completedCount}
            <span className="muted"> / {steps.length}</span>
          </span>
          <span className="muted meta-sm">steps completed</span>
          <div
            className="ig-progress-bar"
            role="progressbar"
            aria-label="Integration guide progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className="ig-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </section>

      <nav className="ig-stepper" aria-label="Integration guide steps">
        <ol>
          {steps.map((step, index) => {
            const completed = isStepCompleted(progress, step.id);
            const isActive = index === activeIndex && !showCompletion;
            const classes = ['ig-stepper-item', isActive ? 'is-active' : '', completed ? 'is-complete' : '']
              .filter(Boolean)
              .join(' ');

            return (
              <li key={step.id} className={classes}>
                <button
                  type="button"
                  className="ig-stepper-button"
                  onClick={() => navigateTo(index)}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}${completed ? ' (completed)' : ''}`}
                >
                  <span className="ig-stepper-dot" aria-hidden="true">
                    {completed ? <GuideIcon name="check" /> : index + 1}
                  </span>
                  <span className="ig-stepper-label">{step.shortTitle}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {showCompletion ? (
        <section className="card ig-complete" aria-labelledby="ig-complete-title">
          <div className="ig-complete-badge" aria-hidden="true">
            <GuideIcon name="check" />
          </div>
          <h3 id="ig-complete-title" className="ig-complete-title" tabIndex={-1} ref={stepHeadingRef}>
            You&apos;re all set! Your OCTOPUS workflow is ready.
          </h3>
          <p className="muted body-sm ig-complete-text">
            Save a snapshot from VS Code whenever you want to capture your work. It appears in your OCTOPUS projects
            as soon as the upload completes.
          </p>
          <div className="ig-complete-actions">
            <Link className="btn btn-primary" to="/">
              Return to Dashboard
            </Link>
            <Link className="btn btn-secondary" to="/projects">
              View Projects
            </Link>
            <Button variant="ghost" type="button" onClick={() => navigateTo(0)}>
              Review the guide
            </Button>
          </div>
        </section>
      ) : (
        <article className={`card ig-step${activeStepCompleted ? ' is-complete' : ''}`} aria-labelledby="ig-step-title">
          <header className="ig-step-header">
            <div className="ig-step-icon" aria-hidden="true">
              <GuideIcon name={activeStep.icon} />
            </div>
            <div className="ig-step-heading">
              <div className="ig-step-meta">
                <span className="eyebrow">
                  Step {activeIndex + 1} of {steps.length}
                </span>
                {activeStepCompleted ? (
                  <span className="badge badge-ok">
                    <GuideIcon name="check" className="ig-badge-icon" />
                    Completed
                  </span>
                ) : null}
              </div>
              <h3 id="ig-step-title" className="ig-step-title" tabIndex={-1} ref={stepHeadingRef}>
                {activeStep.title}
              </h3>
              <p className="muted body-sm ig-step-summary">{activeStep.summary}</p>
            </div>
          </header>

          <div className="ig-step-grid">
            <div className="ig-step-main">
              <h4 className="ig-block-title">Instructions</h4>
              <ol className="ig-instructions">
                {activeStep.instructions.map((instruction, index) => (
                  <li key={instruction.text} className="ig-instruction">
                    <span className="ig-instruction-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="ig-instruction-body body-sm">
                      <p>{renderInline(instruction.text)}</p>
                      {instruction.hint ? <p className="muted meta-sm ig-hint">{renderInline(instruction.hint)}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>

              {activeStep.sections.length > 0 ? (
                <div className="ig-sections">
                  {activeStep.sections.map((section) => (
                    <GuideSectionPanel key={section.id} section={section} />
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="ig-checklist" aria-labelledby="ig-checklist-title">
              <div className="ig-checklist-head">
                <h4 id="ig-checklist-title" className="ig-block-title">
                  Checklist
                </h4>
                <span className="muted meta-sm">
                  {checkedCount}/{activeStep.checklist.length}
                </span>
              </div>
              <ul className="ig-checklist-items">
                {activeStep.checklist.map((item) => {
                  const checked = progress.checkedItemIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label className={`ig-check${checked ? ' is-checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setProgress((current) => toggleChecklistItem(current, activeStep, item.id))}
                        />
                        <span className="ig-check-box" aria-hidden="true">
                          <GuideIcon name="check" />
                        </span>
                        <span className="body-sm">{item.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <Button
                type="button"
                variant={activeStepCompleted ? 'secondary' : 'primary'}
                className="ig-complete-button"
                onClick={onToggleStepCompleted}
                aria-pressed={activeStepCompleted}
              >
                {activeStepCompleted ? 'Mark as not completed' : 'Mark step as completed'}
              </Button>
            </aside>
          </div>

          <footer className="ig-step-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigateTo(activeIndex - 1)}
              disabled={activeIndex === 0}
            >
              <GuideIcon name="arrowLeft" />
              Previous
            </Button>
            <span className="muted meta-sm ig-footer-status">
              {completedCount} of {steps.length} steps completed
            </span>
            {isLastStep ? (
              allComplete ? (
                <Button
                  type="button"
                  onClick={() => {
                    shouldFocusHeadingRef.current = true;
                    setIsReviewing(false);
                  }}
                >
                  Finish
                  <GuideIcon name="arrowRight" />
                </Button>
              ) : (
                <Link className="btn btn-secondary" to="/">
                  Back to Dashboard
                </Link>
              )
            ) : (
              <Button type="button" onClick={() => navigateTo(activeIndex + 1)}>
                Next
                <GuideIcon name="arrowRight" />
              </Button>
            )}
          </footer>
        </article>
      )}
    </div>
  );
}

export function IntegrationGuidePage() {
  const { user } = useAuth();
  const storage = useMemo(() => getBrowserStorage(), []);

  return <IntegrationGuide storageKey={getIntegrationGuideStorageKey(user?.id)} storage={storage} />;
}
