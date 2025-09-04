import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@store/index';
import { Layout } from '@components/layout/Layout';
import { AuthGuard } from '@components/auth/AuthGuard';
import { LoadingScreen } from '@components/common/LoadingScreen';
import { useAuth } from '@hooks/useAuth';
import { useTheme } from '@hooks/useTheme';

// Lazy load pages
const HomePage = React.lazy(() => import('@pages/HomePage'));
const LoginPage = React.lazy(() => import('@pages/LoginPage'));
const RegisterPage = React.lazy(() => import('@pages/RegisterPage'));
const DashboardPage = React.lazy(() => import('@pages/DashboardPage'));
const CoursesPage = React.lazy(() => import('@pages/CoursesPage'));
const TradingPage = React.lazy(() => import('@pages/TradingPage'));
const AnalyticsPage = React.lazy(() => import('@pages/AnalyticsPage'));
const ProfilePage = React.lazy(() => import('@pages/ProfilePage'));
const CommunityPage = React.lazy(() => import('@pages/CommunityPage'));
const NewsPage = React.lazy(() => import('@pages/NewsPage'));
const ToolsPage = React.lazy(() => import('@pages/ToolsPage'));
const HelpPage = React.lazy(() => import('@pages/HelpPage'));
const AboutPage = React.lazy(() => import('@pages/AboutPage'));
const PrivacyPage = React.lazy(() => import('@pages/PrivacyPage'));
const TermsPage = React.lazy(() => import('@pages/TermsPage'));
const ContactPage = React.lazy(() => import('@pages/ContactPage'));
const NotFound = React.lazy(() => import('@components/common/NotFound'));

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { theme } = useTheme();

  React.useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="App">
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/help" element={<HelpPage />} />

          {/* Auth routes */}
          <Route 
            path="/login" 
            element={
              isAuthenticated ? 
              <Navigate to="/dashboard" replace /> : 
              <LoginPage />
            } 
          />
          <Route 
            path="/register" 
            element={
              isAuthenticated ? 
              <Navigate to="/dashboard" replace /> : 
              <RegisterPage />
            } 
          />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <Layout>
                  <DashboardPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/courses/*"
            element={
              <AuthGuard>
                <Layout>
                  <CoursesPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/trading/*"
            element={
              <AuthGuard>
                <Layout>
                  <TradingPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/analytics"
            element={
              <AuthGuard>
                <Layout>
                  <AnalyticsPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/profile/*"
            element={
              <AuthGuard>
                <Layout>
                  <ProfilePage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/community/*"
            element={
              <AuthGuard>
                <Layout>
                  <CommunityPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/news"
            element={
              <AuthGuard>
                <Layout>
                  <NewsPage />
                </Layout>
              </AuthGuard>
            }
          />
          <Route
            path="/tools/*"
            element={
              <AuthGuard>
                <Layout>
                  <ToolsPage />
                </Layout>
              </AuthGuard>
            }
          />

          {/* 404 route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

export default App;
