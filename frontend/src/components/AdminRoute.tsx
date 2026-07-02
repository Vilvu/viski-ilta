import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: Props) {
  const { t } = useTranslation();
  const { isLoading, isAdmin } = useAuth();

  if (isLoading) return <div>{t('common.loading')}</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
