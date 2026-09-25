import { useState } from 'react';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAuth } from '../lib/auth/auth-context';
import { updateProfile } from '../lib/auth/auth-client';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return null;
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSaving(true);

    const result = await updateProfile({ username });

    setIsSaving(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setUser(result.data.user);
    setStatus('Profile updated successfully.');
  };

  return (
    <Card>
      <div className="row-between">
        <div>
          <h3 className="card-title">Profile</h3>
          <p className="muted body-sm">Manage your OCTOPUS account details</p>
        </div>
      </div>

      <form className="form-stack" onSubmit={onSubmit}>
        <label className="eyebrow" htmlFor="profile-username">
          Username
        </label>
        <Input
          id="profile-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label className="eyebrow" htmlFor="profile-email">
          Email
        </label>
        <Input id="profile-email" value={user.email} disabled />

        <label className="eyebrow" htmlFor="profile-email-status">
          Verification status
        </label>
        <Input
          id="profile-email-status"
          value={user.emailVerified ? 'Verified' : 'Not verified'}
          disabled
        />

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="form-success">{status}</p> : null}

        <div>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
