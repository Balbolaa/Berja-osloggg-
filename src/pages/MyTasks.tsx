import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/service-finder/Logo";
import StarRating from "@/components/service-finder/StarRating";
import type { Tables } from "@/integrations/supabase/types";

const STATUS_LABELS: Record<string, string> = {
  open: "Waiting confirm",
  assigned: "Waiting confirm",
  in_progress: "In Process",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  in_progress: "#F5A623",
  waiting_confirm: "#9B59B6",
  completed: "#27AE60",
  cancelled: "#64748B",
};

const TABS = [
  { label: "All", key: "all" },
  { label: "In Process", key: "in_process" },
  { label: "Waiting confirm", key: "waiting_confirm" },
  { label: "Completed", key: "completed" },
];

const MyTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchTasks = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });
      setTasks(data ?? []);
      setLoading(false);
    };
    fetchTasks();
  }, [user]);

  const [activeTab, setActiveTab] = useState("all");
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [reviewMap, setReviewMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchProfiles = async () => {
      const volunteerIds = tasks.map((task) => task.assigned_volunteer_id).filter(Boolean) as string[];
      if (!volunteerIds.length) {
        setProfiles([]);
        setReviewMap(new Map());
        return;
      }

      const [{ data: profileRows }, { data: reviewRows }] = await Promise.all([
        supabase.from("profiles").select("*").in("user_id", volunteerIds),
        supabase.from("reviews").select("reviewed_user_id, rating").in("reviewed_user_id", volunteerIds),
      ]);

      setProfiles(profileRows ?? []);

      const nextMap = new Map<string, number>();
      (reviewRows ?? []).forEach((row) => {
        const current = nextMap.get(row.reviewed_user_id) ?? 0;
        nextMap.set(row.reviewed_user_id, current + row.rating);
      });
      setReviewMap(nextMap);
    };

    fetchProfiles();
  }, [tasks]);

  const filteredTasks = tasks.filter((task) => {
    if (activeTab === "in_process") return task.status === "in_progress";
    if (activeTab === "waiting_confirm") return task.status === "open" || task.status === "assigned";
    if (activeTab === "completed") return task.status === "completed";
    return true;
  });

  if (loading) return <p className="text-body text-center p-8">Загрузка...</p>;

  return (
    <div style={{ minHeight: "100vh", background: "#fff", paddingBottom: 110 }} className="sf-theme">
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px 0", gap: 0 }}>
          <div style={{ flexShrink: 0, paddingRight: 10 }}>
            <Logo size="sm" />
          </div>
          <div style={{ flex: 1, display: "flex" }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`status-tab ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                style={{ flex: 1, fontSize: 12, padding: "10px 4px", whiteSpace: "nowrap" }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "20px 16px 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        {filteredTasks.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "#888" }}>
            No requests in this status
          </div>
        ) : (
          filteredTasks.map((task) => {
            const statusKey =
              task.status === "in_progress"
                ? "in_process"
                : task.status === "completed"
                  ? "completed"
                  : task.status === "cancelled"
                    ? "cancelled"
                    : "waiting_confirm";
            const statusLabel = STATUS_LABELS[task.status] ?? "Waiting confirm";
            const accentColor = STATUS_COLOR[statusKey] || "#1B2CC1";
            const assignedProfile = profiles.find((profile) => profile.user_id === task.assigned_volunteer_id);
            const displayName = assignedProfile?.full_name || "Waiting confirm";
            const shortDesc = task.title || "Task";
            const ratingValue = Math.min(5, Math.max(0, Math.round((reviewMap.get(task.assigned_volunteer_id ?? "") ?? 0) / 5)));

            return (
              <ActivityCard
                key={task.id}
                taskId={task.id}
                name={displayName}
                description={task.description || shortDesc}
                shortDesc={shortDesc}
                address={task.location || "Location not set"}
                rating={ratingValue || 5}
                status={statusKey}
                statusLabel={statusLabel}
                date={task.preferred_date || ""}
                time={task.preferred_time || ""}
                review={null}
                accentColor={accentColor}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default MyTasks;

function ActivityCard({
  taskId,
  name,
  description,
  shortDesc,
  address,
  rating,
  status,
  statusLabel,
  date,
  time,
  review,
  accentColor,
}: {
  taskId: string;
  name: string;
  description: string;
  shortDesc: string;
  address: string;
  rating: number;
  status: string;
  statusLabel: string;
  date: string;
  time: string;
  review: string | null;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [myRating, setMyRating] = useState(rating);

  return (
    <Link to={`/task/${taskId}`}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "#1B2CC1",
          borderRadius: 16,
          color: "#fff",
          padding: "18px 18px",
          cursor: "default",
          transition: "transform 0.22s ease, box-shadow 0.22s ease, padding 0.22s ease",
          transform: hovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
          boxShadow: hovered ? "0 16px 40px rgba(27,44,193,0.45)" : "0 4px 14px rgba(27,44,193,0.22)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 160,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: accentColor,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 20,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {statusLabel}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 90 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              border: "2px solid rgba(255,255,255,0.3)",
              flexShrink: 0,
            }}
          >
            {name[0] || "?"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{name}</div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortDesc}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, opacity: 0.8 }}>
          <svg viewBox="0 0 12 16" width="8" height="10" fill="rgba(255,255,255,0.75)">
            <path d="M6 0C3.24 0 1 2.24 1 5c0 3.75 5 11 5 11s5-7.25 5-11C11 2.24 8.76 0 6 0z" />
          </svg>
          {address}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status === "completed" ? (
            <StarRating value={myRating} onChange={setMyRating} size={18} />
          ) : (
            <StarRating value={myRating} readonly size={18} />
          )}
          {status === "completed" && <span style={{ fontSize: 11, opacity: 0.7 }}>Tap to rate</span>}
        </div>

        {hovered && (
          <div
            className="fade-in"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.2)",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.55, opacity: 0.92 }}>{description}</div>
            <div style={{ display: "flex", gap: 8, fontSize: 12, opacity: 0.75, flexWrap: "wrap" }}>
              {date && <span>📅 {date}</span>}
              {time && <span>🕐 {time}</span>}
            </div>
            {review && (
              <div style={{ fontSize: 12, opacity: 0.8, fontStyle: "italic", lineHeight: 1.5 }}>
                {review}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
