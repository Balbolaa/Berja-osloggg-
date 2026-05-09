import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/service-finder/Logo";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";

interface TaskConversation {
  id: string;
  title: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

const Messages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<TaskConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .or(`requester_id.eq.${user.id},assigned_volunteer_id.eq.${user.id}`)
        .not("assigned_volunteer_id", "is", null);

      if (tasks) {
        const convos: TaskConversation[] = [];
        for (const task of tasks) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("task_id", task.id)
            .order("created_at", { ascending: false })
            .limit(1);

          convos.push({
            id: task.id,
            title: task.title,
            lastMessage: msgs?.[0]?.content,
            lastMessageAt: msgs?.[0]?.created_at,
          });
        }
        setConversations(
          convos.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")),
        );
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) return <p className="text-body text-center p-8">Загрузка...</p>;

  return (
    <div className="relative min-h-screen sf-theme">
      <SoftPinkBackground density={6} seed={33} />
      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="text-center pt-5 pb-4">
          <div className="inline-block rounded-lg border-2 border-[#1B2CC1] bg-white px-6 py-2">
            <Logo size="md" />
          </div>
        </div>

        <div className="flex-1 px-4 pb-28">
          {conversations.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500">
              Нет активных чатов
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              {conversations.map((conv) => (
                <Link key={conv.id} to={`/task/${conv.id}`}>
                  <div
                    className="flex items-center gap-4 rounded-2xl bg-[#FDE8EA] p-4 shadow-[0_2px_8px_rgba(224,131,122,0.12)] transition"
                  >
                    <div className="relative h-14 w-14 shrink-0 rounded-full bg-[#c0a0a0] text-center text-2xl text-slate-200">
                      <span className="leading-[56px]">{conv.title[0] ?? "?"}</span>
                      <div className="verified-dot" style={{ width: 18, height: 18, fontSize: 9 }}>
                        ✓
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-900">{conv.title}</div>
                      {conv.lastMessage && (
                        <div className="mt-1 line-clamp-2 text-sm text-slate-600">{conv.lastMessage}</div>
                      )}
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

export default Messages;
