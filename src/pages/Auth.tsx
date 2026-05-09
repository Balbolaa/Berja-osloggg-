import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { saveLocalRole } from "@/hooks/useAuth";
import { toast } from "sonner";
import Logo from "@/components/service-finder/Logo";
import SoftPinkBackground from "@/components/service-finder/SoftPinkBackground";
import mapIllustration from "@/assets/service-finder/map_part_in_register_,_login_1775649698180.png";
import type { Enums } from "@/integrations/supabase/types";

type AppRole = Enums<"app_role">;

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("requester");
  const [loading, setLoading] = useState(false);
  const [verificationEmailSentTo, setVerificationEmailSentTo] = useState("");
  const [resetSentTo, setResetSentTo] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;

    setLoading(true);

    if (forgotMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setResetSentTo(email);
        toast.success("Письмо для сброса пароля отправлено");
      }
      setLoading(false);
      return;
    }

    if (isSignUp) {
      if (password !== password2) {
        toast.error("Пароли не совпадают");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, selected_role: selectedRole },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        saveLocalRole(data.user.id, selectedRole);
      }

      setVerificationEmailSentTo(email);
      toast.success("Письмо для подтверждения отправлено");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Вход выполнен");
      navigate("/");
    }

    setLoading(false);
  };

  if (verificationEmailSentTo) {
    return (
      <div className="auth-page sf-theme">
        <SoftPinkBackground density={7} seed={11} />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
          <div className="mb-6">
            <Logo size="lg" />
          </div>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-lg">
            <h2 className="text-xl font-semibold">Подтвердите email</h2>
            <p className="mt-3 text-sm text-slate-600">
              Мы отправили письмо на <span className="font-semibold text-slate-900">{verificationEmailSentTo}</span>.
              Перейдите по ссылке, чтобы активировать аккаунт.
            </p>
            <button
              type="button"
              className="btn-blue mt-6"
              onClick={() => {
                setVerificationEmailSentTo("");
                setIsSignUp(false);
              }}
            >
              Перейти ко входу
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (resetSentTo) {
    return (
      <div className="auth-page sf-theme">
        <SoftPinkBackground density={6} seed={77} />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
          <div className="mb-6">
            <Logo size="lg" />
          </div>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-lg">
            <div style={{ fontSize: 56, marginBottom: 12 }}>✉️</div>
            <h2 className="text-xl font-semibold text-[#1B2CC1]">Письмо отправлено</h2>
            <p className="mt-3 text-sm text-slate-600">
              Проверьте почту: <span className="font-semibold text-slate-900">{resetSentTo}</span>
            </p>
            <button
              type="button"
              className="btn-blue mt-6"
              onClick={() => {
                setResetSentTo("");
                setForgotMode(false);
              }}
            >
              Назад к входу
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page sf-theme">
      <SoftPinkBackground density={7} seed={11} />
      <div className="relative z-10 flex min-h-screen flex-col">
        <div style={{ textAlign: "center", padding: "28px 0 10px" }}>
          <Logo size="lg" />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 40px 60px",
            gap: 0,
          }}
        >
          <div style={{ display: "flex", maxWidth: 900, width: "100%" }}>
            <div
              style={{
                flex: "0 0 320px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                paddingRight: 56,
                gap: 18,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 500, textAlign: "center", color: "#1a1a1a", marginBottom: 4 }}>
                {forgotMode ? "Forgot pass ?" : isSignUp ? "Register" : "Login"}
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {isSignUp && !forgotMode && (
                  <input
                    className="field-input"
                    type="text"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    style={{ fontSize: 16, padding: "14px 16px" }}
                  />
                )}

                <input
                  className="field-input"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  style={{ fontSize: 16, padding: "14px 16px" }}
                />

                {!forgotMode && (
                  <>
                    <input
                      className="field-input"
                      type="password"
                      placeholder="pass"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={6}
                      style={{ fontSize: 16, padding: "14px 16px" }}
                    />
                    {isSignUp && (
                      <input
                        className="field-input"
                        type="password"
                        placeholder="pass 2"
                        value={password2}
                        onChange={(event) => setPassword2(event.target.value)}
                        required
                        minLength={6}
                        style={{ fontSize: 16, padding: "14px 16px" }}
                      />
                    )}
                  </>
                )}

                {isSignUp && !forgotMode && (
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {[{ value: "volunteer", label: "Volunteer" }, { value: "requester", label: "Need help" }].map(
                      (role) => (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => setSelectedRole(role.value as AppRole)}
                          style={{
                            flex: 1,
                            padding: "12px 0",
                            borderRadius: 7,
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: "pointer",
                            background: selectedRole === role.value ? "#E03A1E" : "#fff",
                            color: selectedRole === role.value ? "#fff" : "#333",
                            border: selectedRole === role.value ? "2px solid #E03A1E" : "2px solid #ccc",
                            transition: "all 0.15s",
                          }}
                        >
                          {role.label}
                        </button>
                      ),
                    )}
                  </div>
                )}

                <button type="submit" className="btn-blue" style={{ marginTop: 6, fontSize: 18, padding: "14px" }}>
                  {loading ? "Loading..." : forgotMode ? "Send code" : isSignUp ? "Register" : "Login"}
                </button>
              </form>

              {!forgotMode && (
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 15, textAlign: "center" }}
                >
                  Forgot pass ?
                </button>
              )}

              {forgotMode ? (
                <button
                  type="button"
                  onClick={() => setForgotMode(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 15, textAlign: "center" }}
                >
                  ← Back to Login
                </button>
              ) : (
                <div style={{ fontSize: 14, color: "#999", textAlign: "center" }}>
                  {isSignUp ? "Have an account? " : "No account? "}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#1B2CC1", fontWeight: 700, fontSize: 14 }}
                  >
                    {isSignUp ? "Login" : "Register"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ width: 1, background: "#ddd", flexShrink: 0 }} />

            <div style={{ flex: 1, paddingLeft: 56, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0, color: "#1a1a1a" }}>Help out !</h2>
              <p style={{ fontSize: 24, margin: 0, color: "#1a1a1a" }}>
                Get the <span style={{ color: "#E03A1E", fontWeight: 700 }}>help</span> you need !
              </p>
              <img
                src={mapIllustration}
                alt="map"
                style={{ width: "100%", maxWidth: 440, borderRadius: 16, objectFit: "cover" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
