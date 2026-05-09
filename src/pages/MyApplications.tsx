import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";
import Logo from "@/components/service-finder/Logo";

interface ApplicationWithTask {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  task_id: string;
  task?: { id: string; title: string; status: string; category: string };
}

const STATUS_MAP: Record<string, string> = {
  pending: "⏳ Ожидает",
  accepted: "✅ Принят",
  rejected: "❌ Отклонён",
};

const MyApplications = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<ApplicationWithTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("task_applications")
        .select("id, status, message, created_at, task_id")
        .eq("volunteer_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        const taskIds = data.map((a) => a.task_id);
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, status, category")
          .in("id", taskIds);

        setApplications(
          data.map((a) => ({
            ...a,
            task: tasks?.find((t) => t.id === a.task_id),
          })),
        );
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) return <p className="text-body text-center p-8">Загрузка...</p>;

  return (
    <div className="relative min-h-screen sf-theme">
      <SoftPinkBackground density={6} seed={27} />
      <div className="relative z-10 min-h-screen pb-28">
        <div className="text-center pt-5 pb-4">
          <Logo size="md" />
        </div>

        <div className="mx-auto w-full max-w-2xl space-y-4 px-4">
          <h1 className="text-lg font-bold text-slate-900">Мои отклики</h1>

          {applications.length === 0 ? (
            <div className="section-card text-center">
              <p className="text-sm text-slate-500">У вас пока нет откликов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <Link key={app.id} to={`/task/${app.task_id}`}>
                  <div className="section-card transition hover:shadow-md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          {app.task?.title ?? "Задача"}
                        </h3>
                        <span className="text-xs text-slate-500">📁 {app.task?.category}</span>
                      </div>
                      <span className="rounded-full bg-[#FDE8EA] px-3 py-1 text-xs font-semibold text-[#1B2CC1]">
                        {STATUS_MAP[app.status] ?? app.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyApplications;
