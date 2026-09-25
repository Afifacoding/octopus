type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="state-card">
      <h3 className="card-title">{title}</h3>
      <p className="muted body-sm">{message}</p>
    </div>
  );
}
