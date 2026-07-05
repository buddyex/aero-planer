import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, RequireAuth } from './components/auth/ProtectedRoute';
import { Login } from './components/auth/Login';
import { AdminPanel } from './components/admin/AdminPanel';
import { SystemCenter } from './components/system/SystemCenter';
import { Dashboard } from './components/dashboard/Dashboard';
import { FleetManager } from './components/fleet/FleetManager';
import { AppLayout } from './components/layout/AppLayout';
import { MaintenanceJournal } from './components/maintenance/MaintenanceJournal';
import { Profile } from './components/Profile/Profile';
import { PersonnelDirectory } from './components/personnel/PersonnelDirectory';
import { MissionPlanner } from './components/schedule/MissionPlanner';
import { WeatherCenter } from './components/weather/WeatherCenter';
import { WeatherBackgroundSync } from './components/weather/WeatherBackgroundSync';
import { RendererErrorReporter } from './components/ui/RendererErrorReporter';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { useMissionNotifications } from './hooks/useMissionNotifications';

import { ROUTE_ALLOWED_ROLES } from './utils/permissions';

function MissionNotificationsHost() {
  return <>{useMissionNotifications()}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <RendererErrorReporter />
          <WeatherBackgroundSync />
          <MissionNotificationsHost />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.dashboard} />}>
                    <Route index element={<Dashboard />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.schedule} />}>
                    <Route path="schedule" element={<MissionPlanner />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.fleet} />}>
                    <Route path="fleet" element={<FleetManager />} />
                  </Route>
                  <Route
                    element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.maintenance} />}
                  >
                    <Route path="maintenance" element={<MaintenanceJournal />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.weather} />}>
                    <Route path="weather" element={<WeatherCenter />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.profile} />}>
                    <Route path="profile" element={<Profile />} />
                    <Route path="profile/:operatorId" element={<Profile />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.personnel} />}>
                    <Route path="personnel" element={<PersonnelDirectory />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.admin} />}>
                    <Route path="admin" element={<AdminPanel />} />
                  </Route>
                  <Route element={<ProtectedRoute allowedRoles={ROUTE_ALLOWED_ROLES.system} />}>
                    <Route path="system" element={<SystemCenter />} />
                    <Route path="database" element={<Navigate to="/system" replace />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
