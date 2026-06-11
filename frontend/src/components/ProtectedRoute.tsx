import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

export default function TasterRoute({ children }: Props) {
  const { isLoading, isTaster } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();

  if (isLoading) return <div>Loading...</div>;
  if (!isTaster) return <Navigate to={`/events/${eventId}`} replace />;
  return <>{children}</>;
}
