import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import {
  auditSecretCopy,
  auditSecretHide,
  createSecret,
  deleteSecret,
  getVaultSession,
  lockVault,
  listSecrets,
  revealSecret,
  unlockVault,
  updateSecret,
} from '../lib/secrets/secrets-client';
import type { SecretCategory, SecretConfidence, SecretRecord } from '../lib/secrets/types';

const categoryOptions: SecretCategory[] = [
  'API_KEY',
  'ACCESS_TOKEN',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'DATABASE_URL',
  'JWT',
  'OAUTH_CLIENT_SECRET',
  'CLOUD_CREDENTIAL',
  'WEBHOOK_SECRET',
  'PASSWORD',
  'GENERIC_SECRET',
];

const confidenceOptions: SecretConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];

const categoryLabels: Record<SecretCategory, string> = {
  API_KEY: 'API Keys',
  ACCESS_TOKEN: 'Access Tokens',
  SECRET_KEY: 'Secret Keys',
  PRIVATE_KEY: 'Private Keys',
  DATABASE_URL: 'Database URLs',
  JWT: 'JWT Secrets',
  OAUTH_CLIENT_SECRET: 'OAuth Client Secrets',
  CLOUD_CREDENTIAL: 'Cloud Credentials',
  WEBHOOK_SECRET: 'Webhook Secrets',
  PASSWORD: 'Passwords',
  GENERIC_SECRET: 'Generic Secrets',
};

function confidenceTone(confidence: SecretConfidence) {
  if (confidence === 'HIGH') {
    return 'warn' as const;
  }

  return 'neutral' as const;
}

export function ProjectSecretsPage() {
  const { projectId } = useParams();

  const [secrets, setSecrets] = useState<SecretRecord[]>([]);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealCountdowns, setRevealCountdowns] = useState<Record<string, number>>({});
  const hideTimeoutsRef = useRef<Record<string, number>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultExpiresAt, setVaultExpiresAt] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createCategory, setCreateCategory] = useState<SecretCategory>('GENERIC_SECRET');
  const [createConfidence, setCreateConfidence] = useState<SecretConfidence>('MEDIUM');
  const [isCreating, setIsCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<SecretRecord | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCategory, setEditCategory] = useState<SecretCategory>('GENERIC_SECRET');
  const [editConfidence, setEditConfidence] = useState<SecretConfidence>('MEDIUM');
  const [isEditing, setIsEditing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SecretRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredSecrets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) {
      return secrets;
    }

    return secrets.filter((secret) => {
      return (
        secret.label.toLowerCase().includes(query) ||
        secret.category.toLowerCase().includes(query) ||
        secret.maskedValue.toLowerCase().includes(query) ||
        (secret.sourceFilePath ?? '').toLowerCase().includes(query)
      );
    });
  }, [secrets, searchQuery]);

  const groupedSecrets = useMemo(() => {
    const groups = new Map<SecretCategory, SecretRecord[]>();

    for (const category of categoryOptions) {
      groups.set(category, []);
    }

    for (const secret of filteredSecrets) {
      const existing = groups.get(secret.category) ?? [];
      existing.push(secret);
      groups.set(secret.category, existing);
    }

    return categoryOptions
      .map((category) => ({
        category,
        label: categoryLabels[category],
        secrets: groups.get(category) ?? [],
      }))
      .filter((group) => group.secrets.length > 0);
  }, [filteredSecrets]);

  const hasSecrets = useMemo(() => secrets.length > 0, [secrets]);
  const hasFilteredSecrets = useMemo(() => filteredSecrets.length > 0, [filteredSecrets]);

  const clearRevealState = () => {
    Object.values(hideTimeoutsRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });

    hideTimeoutsRef.current = {};
    setRevealedValues({});
    setRevealCountdowns({});
  };

  const handleVaultAccessFailure = (code: string | undefined, message: string) => {
    setActionSuccess(null);

    if (code === 'VAULT_ACCESS_REQUIRED' || code === 'VAULT_UNLOCK_FAILED') {
      clearRevealState();
      setSecrets([]);
      setIsVaultUnlocked(false);
      setVaultExpiresAt(null);
      setVaultError('Vault access expired. Verify password to unlock again.');
      return;
    }

    setActionError(message);
  };

  const loadSecrets = async () => {
    if (!projectId) {
      setError('Project not found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await listSecrets(projectId);

    setIsLoading(false);

    if (!result.success) {
      if (result.error.code === 'VAULT_ACCESS_REQUIRED') {
        setSecrets([]);
        setIsVaultUnlocked(false);
        setVaultExpiresAt(null);
        setVaultError('Vault access expired. Verify password to unlock again.');
        return;
      }

      setError(result.error.message);
      return;
    }

    setSecrets(result.data.secrets);
  };

  const loadVaultSession = async () => {
    if (!projectId) {
      setError('Project not found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setVaultError(null);

    const session = await getVaultSession(projectId);
    if (!session.success) {
      setIsLoading(false);
      setError(session.error.message);
      return;
    }

    setIsVaultUnlocked(session.data.unlocked);
    setVaultExpiresAt(session.data.expiresAt);

    if (!session.data.unlocked) {
      setSecrets([]);
      setIsLoading(false);
      return;
    }

    await loadSecrets();
  };

  useEffect(() => {
    void loadVaultSession();
  }, [projectId]);

  useEffect(() => {
    if (!isVaultUnlocked || !vaultExpiresAt) {
      return;
    }

    const remainingMs = new Date(vaultExpiresAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      clearRevealState();
      setSecrets([]);
      setIsVaultUnlocked(false);
      setVaultExpiresAt(null);
      setVaultError('Vault access expired. Verify password to unlock again.');
      return;
    }

    const timer = window.setTimeout(() => {
      clearRevealState();
      setSecrets([]);
      setIsVaultUnlocked(false);
      setVaultExpiresAt(null);
      setVaultError('Vault access expired. Verify password to unlock again.');
    }, remainingMs + 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isVaultUnlocked, vaultExpiresAt]);

  useEffect(() => {
    return () => {
      clearRevealState();
    };
  }, []);

  const onUnlockVault = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      return;
    }

    setVaultError(null);
    setIsUnlocking(true);

    const result = await unlockVault(projectId, unlockPassword);
    setIsUnlocking(false);

    if (!result.success) {
      setVaultError(result.error.message);
      return;
    }

    setUnlockPassword('');
    setIsVaultUnlocked(true);
    setVaultExpiresAt(result.data.expiresAt);
    await loadSecrets();
  };

  const onLockVault = async () => {
    if (!projectId) {
      return;
    }

    setVaultError(null);
    const result = await lockVault(projectId);
    if (!result.success) {
      setVaultError(result.error.message);
      return;
    }

    clearRevealState();
    setSecrets([]);
    setIsVaultUnlocked(false);
    setVaultExpiresAt(null);
  };

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      return;
    }

    setActionError(null);
    setIsCreating(true);

    const result = await createSecret(projectId, {
      label: createLabel,
      category: createCategory,
      confidence: createConfidence,
      value: createValue,
    });

    setIsCreating(false);

    if (!result.success) {
      handleVaultAccessFailure(result.error.code, result.error.message);
      return;
    }

    setIsCreateOpen(false);
    setCreateLabel('');
    setCreateValue('');
    await loadSecrets();
  };

  const onReveal = async (secretId: string) => {
    if (!projectId) {
      return;
    }

    const confirmed = window.confirm('You are about to reveal a sensitive secret. This action will be recorded.');
    if (!confirmed) {
      return;
    }

    setActionError(null);

    const result = await revealSecret(projectId, secretId);
    if (!result.success) {
      handleVaultAccessFailure(result.error.code, result.error.message);
      return;
    }

    setRevealedValues((current) => ({
      ...current,
      [secretId]: result.data.value,
    }));

    setRevealCountdowns((current) => ({
      ...current,
      [secretId]: 20,
    }));

    if (hideTimeoutsRef.current[secretId]) {
      window.clearTimeout(hideTimeoutsRef.current[secretId]);
    }

    const intervalId = window.setInterval(() => {
      setRevealCountdowns((current) => {
        const next = (current[secretId] ?? 1) - 1;
        if (next <= 0) {
          window.clearInterval(intervalId);
          return current;
        }

        return {
          ...current,
          [secretId]: next,
        };
      });
    }, 1000);

    hideTimeoutsRef.current[secretId] = window.setTimeout(() => {
      window.clearInterval(intervalId);
      void onHide(secretId, false);
    }, 20000);

    await loadSecrets();
  };

  const onHide = async (secretId: string, shouldAudit = true) => {
    if (shouldAudit && projectId) {
      const result = await auditSecretHide(projectId, secretId);
      if (!result.success) {
        handleVaultAccessFailure(result.error.code, result.error.message);
      }
    }

    if (hideTimeoutsRef.current[secretId]) {
      window.clearTimeout(hideTimeoutsRef.current[secretId]);
      delete hideTimeoutsRef.current[secretId];
    }

    setRevealedValues((current) => {
      const next = { ...current };
      delete next[secretId];
      return next;
    });

    setRevealCountdowns((current) => {
      const next = { ...current };
      delete next[secretId];
      return next;
    });
  };

  const onCopy = async (secretId: string) => {
    if (!projectId) {
      return;
    }

    const value = revealedValues[secretId];
    if (!value) {
      setActionError('Reveal a secret before copying it.');
      return;
    }

    const confirmed = window.confirm('This sensitive value will be copied to your clipboard. Continue?');
    if (!confirmed) {
      return;
    }

    const audit = await auditSecretCopy(projectId, secretId);
    if (!audit.success) {
      handleVaultAccessFailure(audit.error.code, audit.error.message);
      return;
    }

    await navigator.clipboard.writeText(value);
  };

  const openEdit = (secret: SecretRecord) => {
    setEditTarget(secret);
    setEditLabel(secret.label);
    setEditCategory(secret.category);
    setEditConfidence(secret.confidence);
  };

  const onEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId || !editTarget) {
      return;
    }

    setActionError(null);
    setIsEditing(true);

    const result = await updateSecret(projectId, editTarget.id, {
      label: editLabel,
      category: editCategory,
      confidence: editConfidence,
    });

    setIsEditing(false);

    if (!result.success) {
      handleVaultAccessFailure(result.error.code, result.error.message);
      return;
    }

    setEditTarget(null);
    await loadSecrets();
  };

  const onDelete = async () => {
    if (!projectId || !deleteTarget) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsDeleting(true);

    const result = await deleteSecret(projectId, deleteTarget.id);

    setIsDeleting(false);

    if (!result.success) {
      handleVaultAccessFailure(result.error.code, result.error.message);
      return;
    }

    const deletedSecretId = result.data.secretId;

    setDeleteTarget(null);
    setSecrets((current) => current.filter((secret) => secret.id !== deletedSecretId));
    setRevealedValues((current) => {
      const next = { ...current };
      delete next[deletedSecretId];
      return next;
    });
    setRevealCountdowns((current) => {
      const next = { ...current };
      delete next[deletedSecretId];
      return next;
    });

    const pendingHideTimeout = hideTimeoutsRef.current[deletedSecretId];
    if (pendingHideTimeout !== undefined) {
      window.clearTimeout(pendingHideTimeout);
      delete hideTimeoutsRef.current[deletedSecretId];
    }

    setActionSuccess('Secret permanently deleted.');
    await loadSecrets();
  };

  if (isLoading) {
    return <LoadingState label="Loading secret vault..." />;
  }

  if (error) {
    return <ErrorState title="Secret vault unavailable" message={error} />;
  }

  return (
    <>
      <Card>
        <div className="row-between">
          <div>
            <h3 className="card-title">Secret Vault</h3>
            <p className="muted body-sm">Encrypted project secrets with explicit reveal controls.</p>
          </div>
          {isVaultUnlocked ? (
            <div className="project-actions">
              <Button type="button" onClick={() => setIsCreateOpen(true)}>
                Add Secret
              </Button>
              <Button type="button" variant="ghost" onClick={() => void onLockVault()}>
                Lock Vault
              </Button>
            </div>
          ) : null}
        </div>

        <div className="project-actions">
          {isVaultUnlocked ? (
            <Button type="button" variant="secondary" onClick={() => void loadSecrets()}>
              Refresh
            </Button>
          ) : null}
          <Link className="btn btn-ghost" to={`/projects/${projectId}`}>
            Back to project
          </Link>
        </div>

        {isVaultUnlocked && vaultExpiresAt ? (
          <p className="muted meta-sm">Vault access expires at: {new Date(vaultExpiresAt).toLocaleTimeString()}</p>
        ) : null}
      </Card>

      {!isVaultUnlocked ? (
        <Card>
          <h4 className="card-title">Secret Vault Locked</h4>
          <p className="muted body-sm">Verify your account password to access encrypted project secrets.</p>
          <form className="form-stack" onSubmit={onUnlockVault}>
            <label className="eyebrow" htmlFor="vault-password">Password</label>
            <Input
              id="vault-password"
              type="password"
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              required
            />

            <div className="modal-actions">
              <Button type="submit" disabled={isUnlocking}>{isUnlocking ? 'Unlocking...' : 'Unlock Vault'}</Button>
              <Link className="btn btn-ghost" to={`/projects/${projectId}`}>Cancel</Link>
            </div>
          </form>
          {vaultError ? <p className="form-error">{vaultError}</p> : null}
        </Card>
      ) : !hasSecrets ? (
        <EmptyState
          title="No secrets in vault"
          message="Review detections from snapshot details or add secrets manually to the vault."
        />
      ) : !hasFilteredSecrets ? (
        <Card>
          <div className="row-between" style={{ gap: 12, alignItems: 'center' }}>
            <h4 className="card-title">No matching secrets</h4>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by label, category, source"
              style={{ maxWidth: 340 }}
            />
          </div>
          <p className="muted body-sm">Adjust your filter or clear search to see all vault secrets.</p>
        </Card>
      ) : (
        <div className="form-stack">
          <Card>
            <div className="row-between" style={{ gap: 12, alignItems: 'center' }}>
              <h4 className="card-title">Vault Secrets</h4>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by label, category, source"
                style={{ maxWidth: 340 }}
              />
            </div>
          </Card>

          <div className="form-stack">
            {groupedSecrets.map((group) => (
              <Card key={group.category}>
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <h4 className="card-title">{group.label}</h4>
                  <Badge tone="neutral">{group.secrets.length}</Badge>
                </div>

                <div className="form-stack" style={{ gap: 8 }}>
                  {group.secrets.map((secret) => (
                    <div key={secret.id} style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                      <div className="row-between" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <p className="body-sm" style={{ margin: 0, fontWeight: 600 }}>{secret.label}</p>
                          <p className="muted meta-sm" style={{ margin: 0 }}>Source: {secret.sourceFilePath ?? 'Manual'}</p>
                        </div>
                        <div className="project-actions" style={{ gap: 8 }}>
                          <Badge tone={confidenceTone(secret.confidence)}>{secret.confidence}</Badge>
                          <Button type="button" variant="secondary" onClick={() => void onReveal(secret.id)}>
                            Reveal
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => void onCopy(secret.id)}>
                            Copy
                          </Button>
                          {revealedValues[secret.id] ? (
                            <Button type="button" variant="ghost" onClick={() => void onHide(secret.id)}>
                              Hide
                            </Button>
                          ) : null}
                          <Button type="button" variant="ghost" onClick={() => openEdit(secret)}>
                            Edit
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setDeleteTarget(secret)}>
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="project-meta muted meta-sm" style={{ marginTop: 8 }}>
                        <span>Masked: {secret.maskedValue}</span>
                        <span>Updated: {new Date(secret.updatedAt).toLocaleString()}</span>
                      </div>

                      {revealedValues[secret.id] ? (
                        <>
                          <p className="body-sm" style={{ color: '#b45309' }}>
                            Sensitive value visible. Automatically hides in {revealCountdowns[secret.id] ?? 0} seconds.
                          </p>
                          <p className="mono body-sm" style={{ marginBottom: 0 }}>{revealedValues[secret.id]}</p>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {vaultError ? <p className="form-error">{vaultError}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {actionSuccess ? (
        <p className="form-success" role="status">
          {actionSuccess}
        </p>
      ) : null}

      <Modal title="Add Secret" isOpen={isCreateOpen}>
        <form className="form-stack" onSubmit={onCreate}>
          <label className="eyebrow" htmlFor="secret-label">Label</label>
          <Input id="secret-label" value={createLabel} onChange={(event) => setCreateLabel(event.target.value)} required />

          <label className="eyebrow" htmlFor="secret-value">Value</label>
          <Input id="secret-value" value={createValue} onChange={(event) => setCreateValue(event.target.value)} required />

          <label className="eyebrow" htmlFor="secret-category">Category</label>
          <select id="secret-category" className="input" value={createCategory} onChange={(event) => setCreateCategory(event.target.value as SecretCategory)}>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <label className="eyebrow" htmlFor="secret-confidence">Confidence</label>
          <select id="secret-confidence" className="input" value={createConfidence} onChange={(event) => setCreateConfidence(event.target.value as SecretConfidence)}>
            {confidenceOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>{isCreating ? 'Adding...' : 'Add Secret'}</Button>
          </div>
        </form>
      </Modal>

      <Modal title="Edit Secret" isOpen={editTarget !== null}>
        <form className="form-stack" onSubmit={onEdit}>
          <label className="eyebrow" htmlFor="edit-secret-label">Label</label>
          <Input id="edit-secret-label" value={editLabel} onChange={(event) => setEditLabel(event.target.value)} required />

          <label className="eyebrow" htmlFor="edit-secret-category">Category</label>
          <select id="edit-secret-category" className="input" value={editCategory} onChange={(event) => setEditCategory(event.target.value as SecretCategory)}>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <label className="eyebrow" htmlFor="edit-secret-confidence">Confidence</label>
          <select id="edit-secret-confidence" className="input" value={editConfidence} onChange={(event) => setEditConfidence(event.target.value as SecretConfidence)}>
            {confidenceOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" disabled={isEditing}>{isEditing ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal title="Delete Secret" isOpen={deleteTarget !== null}>
        <p className="muted body-sm">Delete this secret permanently? This action cannot be undone.</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button type="button" onClick={() => void onDelete()} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Secret'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
