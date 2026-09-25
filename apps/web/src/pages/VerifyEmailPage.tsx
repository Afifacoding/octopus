import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { requestOtp, verifyOtp } from '../lib/auth/auth-client';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const seededEmail = useMemo(() => searchParams.get('email') ?? '', [searchParams]);
  const seededDevelopmentOtp =
    typeof (location.state as { developmentOtp?: unknown } | null)?.developmentOtp === 'string'
      ? ((location.state as { developmentOtp?: string }).developmentOtp ?? null)
      : null;

  const [email, setEmail] = useState(seededEmail);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [developmentOtp, setDevelopmentOtp] = useState<string | null>(seededDevelopmentOtp);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const onVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsVerifying(true);

    const result = await verifyOtp(email, otp);

    setIsVerifying(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setMessage('Email verified. You can now sign in.');
    navigate('/login');
  };

  const onResend = async () => {
    setError(null);
    setMessage(null);
    setIsResending(true);

    const result = await requestOtp(email);

    setIsResending(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    if (typeof result.data.developmentOtp === 'string') {
      setDevelopmentOtp(result.data.developmentOtp);
      setMessage('Development fallback active: use the OTP shown below.');
      return;
    }

    setDevelopmentOtp(null);
    setMessage('A new verification code has been sent to your email.');
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={onVerify}>
        <div className="auth-brand">
          <div className="logo auth-logo">OCTO</div>
          <div className="brand-name auth-title">Verify Email</div>
          <div className="brand-sub">Enter the OTP sent to your Gmail address</div>
        </div>

        <label className="eyebrow" htmlFor="verify-email">
          Gmail address
        </label>
        <Input
          id="verify-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label className="eyebrow" htmlFor="verify-otp">
          6-digit code
        </label>
        <Input
          id="verify-otp"
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
          required
          maxLength={6}
          className="mono"
        />

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}
        {developmentOtp ? (
          <p className="form-success mono">Development OTP: {developmentOtp}</p>
        ) : null}

        <Button variant="primary" type="submit" disabled={isVerifying} className="auth-submit">
          {isVerifying ? 'Verifying...' : 'Verify email'}
        </Button>

        <Button variant="secondary" type="button" onClick={onResend} disabled={isResending}>
          {isResending ? 'Sending...' : 'Resend OTP'}
        </Button>
      </form>
    </div>
  );
}
