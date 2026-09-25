import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { signup } from '../lib/auth/auth-client';

export function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signup({
      username,
      email,
      password,
      confirmPassword,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    navigate(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`, {
      state:
        typeof result.data.developmentOtp === 'string'
          ? {
              developmentOtp: result.data.developmentOtp,
            }
          : undefined,
    });
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <div className="logo auth-logo">OCTO</div>
          <div className="brand-name auth-title">OCTOPUS</div>
          <div className="brand-sub">Create your secure OCTOPUS account</div>
        </div>

        <label className="eyebrow" htmlFor="signup-username">
          Username
        </label>
        <Input
          id="signup-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />

        <label className="eyebrow" htmlFor="signup-email">
          Gmail address
        </label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />

        <label className="eyebrow" htmlFor="signup-password">
          Password
        </label>
        <Input
          id="signup-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />

        <label className="eyebrow" htmlFor="signup-confirm-password">
          Confirm password
        </label>
        <Input
          id="signup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />

        {error ? <p className="form-error">{error}</p> : null}

        <Button variant="primary" type="submit" disabled={isSubmitting} className="auth-submit">
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>

        <p className="auth-links muted">
          Have an account? <Link className="teal" to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
