import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CompareProvider } from './context/CompareContext';

// Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { RequestAccess } from './pages/RequestAccess';
import { Dashboard } from './pages/Dashboard';
import { ESCExplorer } from './pages/ESCExplorer';
import { PropellerExplorer } from './pages/PropellerExplorer';
import { PerformanceAnalytics } from './pages/PerformanceAnalytics';
import { MotorFinder } from './pages/MotorFinder';
import { Docs } from './pages/Docs';
import { Share } from './pages/Share';
import { Versions } from './pages/Versions';
import { ItemRedirect } from './pages/ItemRedirect';
import { ItemProfile } from './pages/ItemProfile';
import { Profile } from './pages/Profile';

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-xs font-semibold text-slate-400 font-mono">
        Authenticating session...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompareProvider>
          <Router>
            <Routes>
              {/* Public Views */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/request_access" element={<RequestAccess />} />
              
               <Route path="/docs" element={<Docs />} />
              <Route path="/documentation" element={<Navigate to="/docs" replace />} />
              <Route path="/versions" element={<Versions />} />
              <Route path="/share/:type/:name" element={<Share />} />

              {/* Protected User Views */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/escs" element={<ProtectedRoute><ESCExplorer /></ProtectedRoute>} />
              <Route path="/propellers" element={<ProtectedRoute><PropellerExplorer /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><PerformanceAnalytics /></ProtectedRoute>} />
              <Route path="/finder" element={<ProtectedRoute><MotorFinder /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

              {/* Dedicated Item Profile Pages */}
              <Route path="/motor/profile/:name" element={<ProtectedRoute><ItemProfile type="motor" /></ProtectedRoute>} />
              <Route path="/motor/:name" element={<ProtectedRoute><ItemProfile type="motor" /></ProtectedRoute>} />

              <Route path="/esc/profile/:name" element={<ProtectedRoute><ItemProfile type="esc" /></ProtectedRoute>} />
              <Route path="/esc/:name" element={<ProtectedRoute><ItemProfile type="esc" /></ProtectedRoute>} />

              <Route path="/propeller/profile/:name" element={<ProtectedRoute><ItemProfile type="propeller" /></ProtectedRoute>} />
              <Route path="/propeller/:name" element={<ProtectedRoute><ItemProfile type="propeller" /></ProtectedRoute>} />

              <Route path="/:itemName" element={<ProtectedRoute><ItemRedirect /></ProtectedRoute>} />

              {/* Fallback redirects */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
        </CompareProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
