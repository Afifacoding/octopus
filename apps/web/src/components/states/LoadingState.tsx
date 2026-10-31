import { BrandLogo } from '../branding/BrandLogo';

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <BrandLogo variant="mark" />
      <div className="spinner" aria-hidden="true" />
      <p className="muted body-sm">{label}</p>
    </div>
  );
}
