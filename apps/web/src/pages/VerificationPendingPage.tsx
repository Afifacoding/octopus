import { Link } from 'react-router-dom';

import { Card } from '../components/ui/Card';
import { BrandLogo } from '../components/branding/BrandLogo';

export function VerificationPendingPage() {
  return (
    <div className="auth">
      <Card className="auth-card">
        <div className="auth-brand">
          <BrandLogo variant="full" />
          <div className="brand-name auth-title">Verification pending</div>
          <p className="brand-sub">Your account exists but is not yet verified.</p>
        </div>
        <p className="muted body-sm">
          Please complete email OTP verification before accessing protected OCTOPUS modules.
        </p>
        <Link className="teal" to="/verify-email">
          Go to verification
        </Link>
      </Card>
    </div>
  );
}
