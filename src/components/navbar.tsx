import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";

type MetaData = {
  user?: { full_name?: string; email?: string };
  role?: { name?: string };
  subscription?: { planType?: string; creditsRemaining?: number };
};

export default function Navbar() {
  const { meta, logout } = useAuth();
  const navigate = useNavigate();

  const m = meta as MetaData | null;
  const userName = m?.user?.full_name || m?.user?.email || "";
  const role = m?.role?.name;
  const plan = m?.subscription?.planType;
  const credits = m?.subscription?.creditsRemaining;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="flex items-center justify-between border-b p-4">
      <div>
        <div className="text-sm font-medium text-muted-foreground">Stable test</div>
        <div className="font-semibold">{userName}</div>
        {role && <div className="text-xs text-muted-foreground">{role}</div>}
      </div>
      <div className="flex items-center gap-4">
        {plan && (
          <div className="text-xs text-muted-foreground">
            {plan}
            {typeof credits === "number" && ` (${credits} credits)`}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  );
}
