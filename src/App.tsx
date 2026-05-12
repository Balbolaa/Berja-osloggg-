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
  // Receives the page/component that should be shown after access checks pass.
  children,
  // Receives the optional list of roles allowed to view this route.
  allowedRoles,
}: {
  // Types the protected content as any valid React node.
  children: React.ReactNode;
  // Types the allowed role list as optional app roles.
  allowedRoles?: AppRole[];
}) => {
  // Reads the current authenticated user, their roles, and auth loading state.
  const { user, roles, loading } = useAuth();
  // Shows a loading message while the authentication state is still being checked.

  if (loading) return <p className="p-8 text-center text-body">Р—Р°РіСЂСѓР·РєР°...</p>;
  // Sends visitors to the auth page when there is no signed-in user.
  if (!user) return <Navigate to="/auth" replace />;

  // Checks role-restricted routes and blocks users whose roles are not allowed.
  if (allowedRoles && !allowedRoles.some((role) => roles.includes(role))) {
    // Redirects unauthorized signed-in users back to the home page.
    return <Navigate to="/" replace />;
  }

  // Wraps the protected page in the shared application layout after access is approved.
  return <AppLayout>{children}</AppLayout>;
};

const App = () => (
  // Provides React Query caching and server-state tools to the entire app.
  <QueryClientProvider client={queryClient}>
    {/* Makes tooltip components work anywhere inside the app. */}
    <TooltipProvider>
      {/* Mounts the default toast notification system. */}
      <Toaster />
      {/* Mounts the Sonner toast notification system. */}
      <Sonner />
      {/* Enables browser URL routing for all pages below. */}
      <BrowserRouter>
        {/* Provides authentication state and role data to the app. */}
        <AuthProvider>
          {/* Defines which component should render for each URL path. */}
          <Routes>
            {/* Shows the authentication page without requiring an existing login. */}
            <Route path="/auth" element={<Auth />} />
            {/* Shows the home page only after the user passes ProtectedRoute checks. */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            {/* Shows task creation only to users with the requester role. */}
            <Route path="/create-task" element={<ProtectedRoute allowedRoles={["requester"]}><CreateTask /></ProtectedRoute>} />
            {/* Shows a requester's own tasks only to users with the requester role. */}
            <Route path="/my-tasks" element={<ProtectedRoute allowedRoles={["requester"]}><MyTasks /></ProtectedRoute>} />
            {/* Shows the volunteer task board only to users with the volunteer role. */}
            <Route path="/task-board" element={<ProtectedRoute allowedRoles={["volunteer"]}><TaskBoard /></ProtectedRoute>} />
            {/* Shows a specific task detail page to any signed-in user. */}
            <Route path="/task/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
            {/* Shows a volunteer's applications only to users with the volunteer role. */}
            <Route path="/my-applications" element={<ProtectedRoute allowedRoles={["volunteer"]}><MyApplications /></ProtectedRoute>} />
            {/* Shows messages to any signed-in user. */}
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            {/* Shows the profile page to any signed-in user. */}
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            {/* Shows the admin dashboard only to users with the moderator role. */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["moderator"]}><AdminDashboard /></ProtectedRoute>} />
            {/* Shows the not-found page for any route that does not match above. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
