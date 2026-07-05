import { Navigate, Outlet } from 'react-router-dom';
import type { OperatorRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { isRoleAllowed } from '../../utils/permissions';
import { AccessDenied } from './AccessDenied';

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

interface ProtectedRouteProps {
  allowedRoles: OperatorRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!isRoleAllowed(user.role, allowedRoles)) {
    return <AccessDenied />;
  }

  return <Outlet />;
}
