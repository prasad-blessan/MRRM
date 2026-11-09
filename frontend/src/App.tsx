import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { RegistrationsPage } from './pages/admin/RegistrationsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { UploadPage } from './pages/UploadPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { WorkflowMonitorPage } from './pages/WorkflowMonitorPage'

const SOON = [
  ['/records', 'Records'],
  ['/outputs', 'Final Outputs'],
  ['/settings', 'Settings'],
] as const

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/policies/privacy" element={<PlaceholderPage title="Privacy & HIPAA policy" />} />
      <Route path="/policies/sla" element={<PlaceholderPage title="SLA policy" />} />
      <Route path="/contact" element={<PlaceholderPage title="Contact us" />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/upload"
        element={
          <RequireAuth roles={['CLIENT_USER']}>
            <UploadPage />
          </RequireAuth>
        }
      />
      <Route
        path="/workflow"
        element={
          <RequireAuth>
            <WorkflowMonitorPage />
          </RequireAuth>
        }
      />
      {SOON.map(([path, title]) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <ComingSoonPage title={title} />
            </RequireAuth>
          }
        />
      ))}
      <Route
        path="/admin/registrations"
        element={
          <RequireAuth roles={['LS_ADMIN']}>
            <RegistrationsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
