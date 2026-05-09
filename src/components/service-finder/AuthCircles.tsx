export const AuthCircles = () => (
  <>
    <div className="auth-circle" style={{ width: 110, height: 110, top: -30, left: -35 }} />
    <div className="auth-circle" style={{ width: 260, height: 260, top: 30, right: -80 }} />
    <div className="auth-circle" style={{ width: 160, height: 160, bottom: 40, left: "22%" }} />
    <div className="auth-circle" style={{ width: 240, height: 240, bottom: -60, right: -60 }} />
  </>
);

const STAR_POSITIONS = [
  { top: "8%", left: "4%" },
  { top: "18%", left: "88%" },
  { top: "32%", left: "10%" },
  { top: "45%", left: "82%" },
  { top: "58%", left: "6%" },
  { top: "68%", left: "90%" },
  { top: "78%", left: "15%" },
  { top: "88%", left: "75%" },
  { top: "92%", left: "35%" },
  { top: "12%", left: "50%" },
];

export const StarBackground = () => (
  <div className="star-bg-overlay">
    {STAR_POSITIONS.map((pos, i) => (
      <span key={i} className="star-bg-item" style={{ top: pos.top, left: pos.left }}>
        ★
      </span>
    ))}
  </div>
);

export const PinkCircles = () => (
  <>
    <div className="auth-circle" style={{ width: 120, height: 120, top: 20, left: -45 }} />
    <div className="auth-circle" style={{ width: 140, height: 140, top: 40, right: -50 }} />
    <div className="auth-circle" style={{ width: 100, height: 100, bottom: 130, left: -35 }} />
    <div className="auth-circle" style={{ width: 130, height: 130, bottom: 100, right: -40 }} />
  </>
);
