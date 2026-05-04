import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import ExpensePage from './pages/ExpensePage';
import LeavePage from './pages/LeavePage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ReportsPage from './pages/ReportsPage';
import ProjectMasterPage from './pages/ProjectMasterPage';
import TimesheetPage from './pages/TimesheetPage';

function AppShell({ children }) {
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: 'linear-gradient(135deg, #042f2e 0%, #0f4c45 45%, #1e293b 100%)' }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal shadow-lg" style={{ boxShadow: '0 8px 24px rgba(15,118,110,0.4)' }}>
          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Restoring your session…</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />

      <Route path="/timeline" element={<Navigate to="/timesheet" replace />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/timesheet"
        element={
          <ProtectedRoute>
            <AppShell>
              <TimesheetPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <AppShell>
              <ExpensePage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <AppShell>
              <OnboardingPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leave"
        element={
          <ProtectedRoute>
            <AppShell>
              <LeavePage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <AppShell>
              <ReportsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AppShell>
              <AdminPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/projects"
        element={
          <ProtectedRoute adminOnly>
            <AppShell>
              <ProjectMasterPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
