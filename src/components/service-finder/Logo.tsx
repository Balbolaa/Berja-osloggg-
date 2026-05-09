import logoUrl from "@/assets/service-finder/Logo_1775649698180.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const heights = { sm: 36, md: 52, lg: 70 };

const Logo = ({ size = "md", className = "" }: LogoProps) => (
  <img
    src={logoUrl}
    alt="Биржа услуг"
    className={`sf-logo ${className}`}
    style={{ height: heights[size], width: "auto", display: "inline-block", objectFit: "contain" }}
  />
);

export default Logo;
