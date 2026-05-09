import { useLocation, useNavigate } from "react-router-dom";
import navStatusNormal from "@/assets/service-finder/status_button_1775649698181.png";
import navStatusActive from "@/assets/service-finder/status_button_when_pressed_1775649698181.png";
import navCreateNormal from "@/assets/service-finder/Make_a_request_button_1775649698180.png";
import navCreateActive from "@/assets/service-finder/make_a_request_when_pressed_1775649698180.png";
import navMsgNormal from "@/assets/service-finder/Messages_button_1775649698180.png";
import navMsgActive from "@/assets/service-finder/messages_button_when_pressed_1775649698180.png";
import navProfileNormal from "@/assets/service-finder/home_screen_button_1775649698180.png";
import navProfileActive from "@/assets/service-finder/home_button_pressed_1775649698180.png";

type AppRole = "volunteer" | "requester" | "moderator";

type NavItem = {
  key: string;
  path: string;
  label: string;
  normal: string;
  active: string;
};

const buildNavItems = (roles: AppRole[]) => {
  const isVolunteer = roles.includes("volunteer");
  const isRequester = roles.includes("requester");
  const statusPath = isVolunteer ? "/task-board" : "/my-tasks";

  const items: NavItem[] = [
    { key: "status", path: statusPath, label: "Activity", normal: navStatusNormal, active: navStatusActive },
  ];

  if (isRequester) {
    items.push({
      key: "create",
      path: "/create-task",
      label: "Create",
      normal: navCreateNormal,
      active: navCreateActive,
    });
  }

  items.push(
    { key: "messages", path: "/messages", label: "Messages", normal: navMsgNormal, active: navMsgActive },
    { key: "profile", path: "/profile", label: "Profile", normal: navProfileNormal, active: navProfileActive },
  );

  return items;
};

const BottomNav = ({ roles }: { roles: AppRole[] }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const items = buildNavItems(roles);

  const isActive = (item: NavItem) => {
    if (item.key === "messages") {
      return location.pathname === "/messages" || location.pathname.startsWith("/task/");
    }
    if (item.key === "status") {
      return location.pathname === item.path || location.pathname === "/";
    }
    return location.pathname === item.path;
  };

  return (
    <div
      className="bottom-nav"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#fff",
        border: "2.5px solid #1B2CC1",
        borderRadius: 60,
        padding: "10px 28px",
        display: "flex",
        gap: 18,
        alignItems: "center",
        boxShadow: "0 6px 24px rgba(0,0,0,0.14)",
        zIndex: 100,
      }}
    >
      {items.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (location.pathname !== item.path) {
                navigate(item.path);
              }
            }}
            title={item.label}
            aria-label={item.label}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "transform 0.15s ease",
              lineHeight: 0,
            }}
            onMouseEnter={(event) => (event.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(event) => (event.currentTarget.style.transform = "scale(1)")}
          >
            <img
              src={active ? item.active : item.normal}
              alt={item.label}
              style={{ width: 60, height: 60, objectFit: "contain" }}
            />
          </button>
        );
      })}
    </div>
  );
};

export default BottomNav;
