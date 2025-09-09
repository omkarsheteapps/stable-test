import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Login from "./pages/login/Login";
import Projects from "./pages/projects/Projects";
import Apps from "./pages/apps/Apps";
import Admin from "./pages/admin/Admin";
import ProtectedRoute from "./routes/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";

function RoleRoutes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "internal";

  return isAdmin ? (
    <>
      <Route path="/" element={<Navigate to="/admin-dashboard" replace />} />
      <Route path="/admin-dashboard" element={<Admin />} />
      <Route path="/projects" element={<Navigate to="/" replace />} />
      <Route path="/applications" element={<Navigate to="/" replace />} />
    </>
  ) : (
    <>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/applications/:id" element={<Apps />} />
      <Route path="/admin-dashboard" element={<Navigate to="/" replace />} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* public */}
          <Route path="/login" element={<Login />} />

          {/* private */}
          <Route element={<ProtectedRoute />}>
            <Route path="/*" element={<RoleRoutes />} />
          </Route>

          {/* catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
