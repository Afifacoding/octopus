type ErrorStateProps = {
  title: string;
  message: string;
};

export function ErrorState({ title, message }: ErrorStateProps) {
  return (
    <div className="state-card state-error" role="alert">
      <h3 className="card-title">{title}</h3>
      <p className="body-sm">{message}</p>
    </div>
  );
}
