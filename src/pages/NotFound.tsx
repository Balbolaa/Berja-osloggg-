import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";
import Logo from "@/components/service-finder/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen sf-theme">
      <SoftPinkBackground density={6} seed={71} />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Logo size="lg" />
        <h1 className="mt-6 text-4xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-base text-slate-600">Oops! Page not found</p>
        <a href="/" className="btn-blue mt-6 max-w-[240px]">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
