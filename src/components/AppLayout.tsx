import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import VerifiedAvatar from "@/components/VerifiedAvatar";
import BottomNav from "@/components/service-finder/BottomNav";
import Logo from "@/components/service-finder/Logo";
import type { Tables } from "@/integrations/supabase/types";

type AppRole = "volunteer" | "requester" | "moderator";

const getInitials = (fullName?: string | null) =>
  fullName?.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, roles, signOut } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [isVerified, setIsVerified] = useState(false);

  const isVolunteer = roles.includes("volunteer");
  const isModerator = roles.includes("moderator");
  const isTaskBoardPage = location.pathname === "/task-board";
  const hideGlobalNav = isTaskBoardPage;

  useEffect(() => {
    if (!user) return;

    const fetchTopbarData = async () => {
      const [{ data: profileRow }, { data: approvedVerification }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("verifications").select("id").eq("user_id", user.id).eq("status", "approved").maybeSingle(),
      ]);

      setProfile(profileRow ?? null);
      setIsVerified(Boolean(approvedVerification));

      if (roles.includes("volunteer")) {
        const { data: reviewRows } = await supabase.from("reviews").select("rating").eq("reviewed_user_id", user.id);
        const count = reviewRows?.length ?? 0;
        setReviewCount(count);
        setAverageRating(count ? reviewRows!.reduce((sum, item) => sum + item.rating, 0) / count : null);
      } else {
        setReviewCount(0);
        setAverageRating(null);
      }
    };

    fetchTopbarData();
  }, [roles, user]);

  return (
    <div className={`sf-theme flex flex-col bg-white ${isTaskBoardPage ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      {!isTaskBoardPage && (
        <header className="shrink-0 flex items-center justify-between border-b bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4">
          <Link to="/" className="inline-flex items-center gap-2">
            <Logo size="sm" />
          </Link>

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-[#1B2CC1]/10 bg-white/90 px-2.5 py-1.5 text-left transition hover:border-[#1B2CC1]/40"
              >
                <VerifiedAvatar
                  src={profile?.avatar_url ?? undefined}
                  alt={profile?.full_name || user?.email || "Профиль"}
                  fallback={getInitials(profile?.full_name || user?.email)}
                  verified={isVerified}
                  className="h-9 w-9 border"
                  fallbackClassName="font-bold"
                />
                <div className="hidden sm:block">
                  <p className="max-w-[160px] truncate text-sm font-bold leading-tight text-foreground">
                    {profile?.full_name || user?.email || "Профиль"}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {isVolunteer && averageRating !== null
                      ? `★ ${averageRating.toFixed(1)} · ${reviewCount} отзывов`
                      : "Открыть профиль"}
                  </p>
                </div>
              </button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Мой профиль</DialogTitle>
                <DialogDescription>Быстрый просмотр профиля и выход из аккаунта.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/10 bg-secondary/30 p-4 text-center">
                  <VerifiedAvatar
                    src={profile?.avatar_url ?? undefined}
                    alt={profile?.full_name || user?.email || "Профиль"}
                    fallback={getInitials(profile?.full_name || user?.email)}
                    verified={isVerified}
                    className="h-24 w-24 border-2"
                    fallbackClassName="text-xl font-bold"
                  />
                  <div className="space-y-1">
                    <p className="text-lg font-bold">{profile?.full_name || user?.email || "Профиль"}</p>
                    {isVolunteer ? (
                      <p className="text-sm text-muted-foreground">
                        {averageRating !== null ? `★ ${averageRating.toFixed(1)} · ${reviewCount} отзывов` : "★ Пока нет оценок"}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    )}
                  </div>
                </div>

                {isModerator && (
                  <Link
                    to="/admin"
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    <Shield className="h-4 w-4" />
                    Модерация
                  </Link>
                )}

              <Button
                variant="outline"
                className="min-h-[44px] w-full gap-2 font-bold hover:bg-[#E03A1E] hover:text-white hover:border-[#E03A1E]"
                onClick={signOut}
              >
                <LogOut className="h-5 w-5" />
                <span>Выйти</span>
              </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>
      )}

      <main
        className={`flex-1 ${
          isTaskBoardPage ? "min-h-0 w-full overflow-hidden" : "container max-w-[1100px] px-4 pb-28 pt-4 sm:pt-5"
        }`}
      >
        {children}
      </main>

      {!hideGlobalNav && <BottomNav roles={roles as AppRole[]} />}
    </div>
  );
};

export default AppLayout;
