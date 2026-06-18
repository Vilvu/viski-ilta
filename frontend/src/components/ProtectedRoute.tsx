import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

export default function TasterRoute({ children }: Props) {
  const { t } = useTranslation();
  const { isLoading, isTaster } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();

  if (isLoading) return <div>{t('common.loading')}</div>;
  if (!isTaster) return <Navigate to={`/events/${eventId}`} replace />;
  return <>{children}</>;
}
