import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import EventsPage from '@/pages/EventsPage';
import EventDetailPage from '@/pages/EventDetailPage';
import WhiskeyDetailPage from '@/pages/WhiskeyDetailPage';
import NotFoundPage from '@/pages/NotFoundPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route
          path="events/:eventId/whiskeys/:whiskeyId"
          element={<WhiskeyDetailPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
