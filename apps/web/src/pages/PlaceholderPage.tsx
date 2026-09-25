import { Card } from '../components/ui/Card';

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Card>
      <h3 className="card-title">{title}</h3>
      <p className="muted body-sm">{description}</p>
    </Card>
  );
}
