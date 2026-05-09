import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import CreateTask from "@/pages/CreateTask";
import MyTasks from "@/pages/MyTasks";
import TaskBoard from "@/pages/TaskBoard";
import TaskDetail from "@/pages/TaskDetail";
import MyApplications from "@/pages/MyApplications";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/NotFound";
import type { Enums } from "@/integrations/supabase/types";

const queryClient = new QueryClient();

type AppRole = Enums<"app_role">;

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}) => {
  const { user, roles, loading } = useAuth();

  if (loading) return <p className="p-8 text-center text-body">Р—Р°РіСЂСѓР·РєР°...</p>;
  if (!user) return <Navigate to="/auth" replace />;

  if (allowedRoles && !allowedRoles.some((role) => roles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/create-task" element={<ProtectedRoute allowedRoles={["requester"]}><CreateTask /></ProtectedRoute>} />
            <Route path="/my-tasks" element={<ProtectedRoute allowedRoles={["requester"]}><MyTasks /></ProtectedRoute>} />
            <Route path="/task-board" element={<ProtectedRoute allowedRoles={["volunteer"]}><TaskBoard /></ProtectedRoute>} />
            <Route path="/task/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
            <Route path="/my-applications" element={<ProtectedRoute allowedRoles={["volunteer"]}><MyApplications /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["moderator"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
