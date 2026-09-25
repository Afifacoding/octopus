import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../lib/auth/auth-context';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await login({ emailOrUsername, password });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.code === 'EMAIL_NOT_VERIFIED') {
        const query = emailOrUsername.includes('@')
          ? `?email=${encodeURIComponent(emailOrUsername.toLowerCase())}`
          : '';
        navigate(`/verify-email${query}`);
        return;
      }

      setError(result.message ?? 'Login failed');
      return;
    }

    navigate(from, { replace: true });
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <div className="logo auth-logo">OCTO</div>
          <div className="brand-name auth-title">OCTOPUS</div>
          <div className="brand-sub">Your App&apos;s Black Box Recorder</div>
        </div>

        <label className="eyebrow" htmlFor="login-email-username">
          Email or username
        </label>
        <Input
          id="login-email-username"
          value={emailOrUsername}
          onChange={(event) => setEmailOrUsername(event.target.value)}
          autoComplete="username"
          required
        />

        <label className="eyebrow" htmlFor="login-password">
          Password
        </label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        {error ? <p className="form-error">{error}</p> : null}

        <Button variant="primary" type="submit" disabled={isSubmitting} className="auth-submit">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>

        <p className="auth-links muted">
          No account? <Link className="teal" to="/signup">Create one</Link>
        </p>
      </form>
    </div>
  );
}
