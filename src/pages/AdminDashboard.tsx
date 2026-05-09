import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VerifiedAvatar from "@/components/VerifiedAvatar";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";
import Logo from "@/components/service-finder/Logo";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type VerificationWithProfile = Tables<"verifications"> & {
  profile?: Tables<"profiles">;
  isVerified?: boolean;
};

type ReportPhoto = { name: string; url: string };
type ReportPayload = { taskId: string; taskTitle: string; explanation: string; photos: ReportPhoto[] };
type ReportWithPayload = Tables<"reports"> & { payload: ReportPayload | null };

const getInitials = (fullName?: string | null) =>
  fullName?.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";

const parseReportDetails = (details?: string | null): ReportPayload | null => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<ReportPayload>;
    if (typeof parsed.explanation !== "string") return null;
    return {
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : "",
      taskTitle: typeof parsed.taskTitle === "string" ? parsed.taskTitle : "",
      explanation: parsed.explanation,
      photos: Array.isArray(parsed.photos)
        ? parsed.photos.filter(
            (item): item is ReportPhoto =>
              Boolean(item) && typeof item === "object" && typeof item.name === "string" && typeof item.url === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
};

const AdminDashboard = () => {
  const { user, roles } = useAuth();
  const [reports, setReports] = useState<ReportWithPayload[]>([]);
  const [verifications, setVerifications] = useState<VerificationWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const isModerator = roles.includes("moderator");
  const pendingReportsCount = useMemo(
    () => reports.filter((report) => report.status === "pending").length,
    [reports],
  );

  useEffect(() => {
    if (!isModerator) return;

    const fetchData = async () => {
      const [{ data: reportsData }, { data: verifData }] = await Promise.all([
        supabase.from("reports").select("*").order("created_at", { ascending: false }),
        supabase.from("verifications").select("*").order("created_at", { ascending: false }),
      ]);

      setReports((reportsData ?? []).map((report) => ({ ...report, payload: parseReportDetails(report.details) })));

      if (verifData?.length) {
        const userIds = [...new Set(verifData.map((item) => item.user_id))];
        const [{ data: profiles }, { data: approvedRows }] = await Promise.all([
          supabase.from("profiles").select("*").in("user_id", userIds),
          supabase.from("verifications").select("user_id").eq("status", "approved").in("user_id", userIds),
        ]);

        const approvedSet = new Set((approvedRows ?? []).map((row) => row.user_id));
        setVerifications(
          verifData.map((item) => ({
            ...item,
            profile: profiles?.find((profile) => profile.user_id === item.user_id),
            isVerified: approvedSet.has(item.user_id),
          })),
        );
      } else {
        setVerifications([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [isModerator]);

  const resolveReport = async (reportId: string) => {
    if (!user) return;
    await supabase.from("reports").update({ status: "resolved", moderator_id: user.id }).eq("id", reportId);
    toast.success("Жалоба обработана");
    setReports((prev) => prev.map((report) => (report.id === reportId ? { ...report, status: "resolved" } : report)));
  };

  const endReportedTask = async (report: ReportWithPayload) => {
    if (!user || !report.payload?.taskId) return;

    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "cancelled" })
      .eq("id", report.payload.taskId);

    if (taskError) {
      toast.error(`Не удалось завершить задачу: ${taskError.message}`);
      return;
    }

    const { error: reportError } = await supabase
      .from("reports")
      .update({ status: "resolved", moderator_id: user.id })
      .eq("id", report.id);

    if (reportError) {
      toast.error(`Задача остановлена, но жалобу не удалось закрыть: ${reportError.message}`);
      return;
    }

    toast.success("Задача завершена модератором");
    setReports((prev) => prev.map((item) => (item.id === report.id ? { ...item, status: "resolved" } : item)));
  };

  const banUser = async (userId: string) => {
    if (!user) return;
    await supabase.from("bans").insert({
      user_id: userId,
      moderator_id: user.id,
      reason: "Нарушение правил платформы",
    });
    toast.success("Пользователь забанен");
  };

  const updateVerification = async (verificationId: string, status: "approved" | "rejected") => {
    if (!user) return;

    await supabase.from("verifications").update({ status, reviewer_id: user.id }).eq("id", verificationId);
    toast.success(status === "approved" ? "Верификация одобрена" : "Верификация отклонена");

    setVerifications((prev) =>
      prev.map((item) =>
        item.id === verificationId
          ? { ...item, status, reviewer_id: user.id, isVerified: status === "approved" }
          : status === "approved" && item.user_id === prev.find((v) => v.id === verificationId)?.user_id
            ? { ...item, isVerified: true }
            : item,
      ),
    );
  };

  if (!isModerator) {
    return (
      <div className="relative min-h-screen sf-theme">
        <SoftPinkBackground density={5} seed={60} />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <Logo size="md" />
          <p className="mt-4 text-sm text-slate-500">Доступ запрещён</p>
        </div>
      </div>
    );
  }

  if (loading) return <p className="p-8 text-center text-body">Загрузка...</p>;

  return (
    <div className="relative min-h-screen sf-theme">
      <SoftPinkBackground density={5} seed={52} />
      <div className="relative z-10 min-h-screen pb-28">
        <div className="text-center pt-5 pb-4">
          <Logo size="md" />
        </div>

        <div className="mx-auto w-full max-w-4xl space-y-4 px-4">
          <h1 className="text-lg font-bold text-slate-900">Панель модератора</h1>

          <Tabs defaultValue="reports">
            <TabsList className="min-h-tap bg-white/90">
              <TabsTrigger value="reports" className="min-h-tap text-body font-bold">
                Жалобы ({pendingReportsCount})
              </TabsTrigger>
              <TabsTrigger value="verifications" className="min-h-tap text-body font-bold">
                Верификация ({verifications.filter((item) => item.status === "pending").length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reports" className="mt-4 space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="section-card space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">Причина: {report.reason}</p>
                      {report.payload?.taskTitle && (
                        <p className="mt-1 text-xs text-slate-500">Задача: {report.payload.taskTitle}</p>
                      )}
                      <p className="mt-2 text-sm text-slate-600">
                        {report.payload?.explanation || report.details || "Описание не добавлено"}
                      </p>
                      <Badge variant="secondary" className="mt-3">
                        {report.status === "pending" ? "⏳ Ожидает" : "✅ Решена"}
                      </Badge>
                    </div>

                    {report.status === "pending" && (
                      <div className="flex flex-col gap-2">
                        {report.payload?.taskId && (
                          <Button
                            size="lg"
                            variant="outline"
                            className="min-h-tap font-bold"
                            onClick={() => endReportedTask(report)}
                          >
                            ⛔ Завершить задачу
                          </Button>
                        )}
                        <Button size="lg" className="min-h-tap font-bold" onClick={() => resolveReport(report.id)}>
                          ✅ Решить
                        </Button>
                        <Button
                          size="lg"
                          variant="destructive"
                          className="min-h-tap font-bold"
                          onClick={() => banUser(report.reported_user_id)}
                        >
                          🚫 Забанить
                        </Button>
                      </div>
                    )}
                  </div>

                  {Boolean(report.payload?.photos.length) && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {report.payload?.photos.map((photo) => (
                        <a
                          key={photo.url}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="overflow-hidden rounded-lg border bg-secondary/30"
                        >
                          <img src={photo.url} alt={photo.name} className="h-32 w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {reports.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Нет жалоб</p>}
            </TabsContent>

            <TabsContent value="verifications" className="mt-4 space-y-4">
              {verifications.map((verification) => (
                <div key={verification.id} className="section-card space-y-4">
                  <div className="flex items-center gap-4">
                    <VerifiedAvatar
                      src={verification.profile?.avatar_url ?? undefined}
                      alt={verification.profile?.full_name || "Пользователь"}
                      fallback={getInitials(verification.profile?.full_name)}
                      verified={verification.isVerified}
                      className="h-16 w-16 border"
                      fallbackClassName="font-bold"
                    />
                    <div>
                      <p className="text-base font-bold text-slate-900">
                        {verification.profile?.full_name || "Пользователь"}
                      </p>
                      <Badge variant="secondary" className="mt-2">
                        {verification.status === "pending"
                          ? "⏳ Ожидает"
                          : verification.status === "approved"
                            ? "✅ Одобрена"
                            : "❌ Отклонена"}
                      </Badge>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border bg-secondary/40">
                    <img
                      src={verification.document_url}
                      alt="Паспорт на проверку"
                      className="max-h-[420px] w-full object-contain"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href={verification.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[#1B2CC1] underline"
                    >
                      Открыть фото отдельно
                    </a>
                  </div>

                  {verification.status === "pending" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button size="lg" className="min-h-tap font-bold" onClick={() => updateVerification(verification.id, "approved")}>
                        ✅ Одобрить
                      </Button>
                      <Button
                        size="lg"
                        variant="destructive"
                        className="min-h-tap font-bold"
                        onClick={() => updateVerification(verification.id, "rejected")}
                      >
                        ❌ Отказать
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {verifications.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Нет заявок на верификацию</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
