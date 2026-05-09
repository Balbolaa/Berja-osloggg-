import { Navigate } from 'react-router-dom';
import { getSavedLocalRole, useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user, roles, loading } = useAuth();

  if (loading) return <p className="p-8 text-center text-body">Загрузка...</p>;

  const preferredRole = getSavedLocalRole(user?.id);

  if (preferredRole === 'volunteer' && roles.includes('volunteer')) {
    return <Navigate to="/task-board" replace />;
  }

  if (preferredRole === 'requester' && roles.includes('requester')) {
    return <Navigate to="/my-tasks" replace />;
  }

  if (preferredRole === 'moderator' && roles.includes('moderator')) {
    return <Navigate to="/admin" replace />;
  }

  if (roles.includes('volunteer')) return <Navigate to="/task-board" replace />;
  if (roles.includes('requester')) return <Navigate to="/my-tasks" replace />;
  if (roles.includes('moderator')) return <Navigate to="/admin" replace />;

  return <Navigate to="/my-tasks" replace />;
};

export default Index;
