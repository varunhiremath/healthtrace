import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import LoadingPage from './pages/LoadingPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LogPage from './pages/LogPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ReportEditorPage from './pages/ReportEditorPage.jsx';
import ReportDetailPage from './pages/ReportDetailPage.jsx';
import TrendsPage from './pages/TrendsPage.jsx';
import MarkerDetailPage from './pages/MarkerDetailPage.jsx';
import MorePage from './pages/MorePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ProfilesPage from './pages/ProfilesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ImportPage from './pages/ImportPage.jsx';

export const router = createBrowserRouter(
  [
    { path: '/', element: <LoadingPage /> },
    {
      element: <AppLayout />,
      children: [
        { path: '/home', element: <HomePage /> },
        { path: '/log', element: <LogPage /> },
        { path: '/reports', element: <ReportsPage /> },
        // '/reports/new' must be declared before '/reports/:id', or "new"
        // would be matched as a report id.
        { path: '/reports/new', element: <ReportEditorPage /> },
        { path: '/reports/:id', element: <ReportDetailPage /> },
        { path: '/reports/:id/edit', element: <ReportEditorPage /> },
        { path: '/trends', element: <TrendsPage /> },
        { path: '/markers/:key', element: <MarkerDetailPage /> },
        { path: '/more', element: <MorePage /> },
        { path: '/profiles', element: <ProfilesPage /> },
        // '/profiles/new' before '/profiles/:id', or "new" is read as an id.
        { path: '/profiles/new', element: <ProfilePage /> },
        { path: '/profiles/:id', element: <ProfilePage /> },
        { path: '/settings', element: <SettingsPage /> },
        { path: '/import', element: <ImportPage /> },
        // Anything unrecognised goes home rather than showing a blank screen.
        { path: '*', element: <Navigate to="/home" replace /> },
      ],
    },
  ],
  // Basename mirrors Vite's BASE_URL, so a Capacitor WebView (base '/') and
  // GitHub Pages (base '/healthtrace/') both match.
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' }
);
