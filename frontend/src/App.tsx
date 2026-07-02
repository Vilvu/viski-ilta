import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import EventsPage from '@/pages/EventsPage';
import EventDetailPage from '@/pages/EventDetailPage';
import WhiskeyDetailPage from '@/pages/WhiskeyDetailPage';
import CatalogWhiskeyDetailPage from '@/pages/CatalogWhiskeyDetailPage';
import RankingPage from '@/pages/RankingPage';
import UserManagementPage from '@/pages/UserManagementPage';
import NotFoundPage from '@/pages/NotFoundPage';
import TasterRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('app.name');
    document.documentElement.lang = i18n.language;
  }, [i18n.language, t]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="ranking" element={<RankingPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route
          path="whiskeys/:whiskeyId"
          element={
            <TasterRoute>
              <CatalogWhiskeyDetailPage />
            </TasterRoute>
          }
        />
        <Route
          path="events/:eventId/whiskeys/:whiskeyId"
          element={
            <TasterRoute>
              <WhiskeyDetailPage />
            </TasterRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <AdminRoute>
              <UserManagementPage />
            </AdminRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
