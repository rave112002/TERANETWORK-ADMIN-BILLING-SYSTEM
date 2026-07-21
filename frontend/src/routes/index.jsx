import { Routes, Route, Navigate } from "react-router-dom";

import CMSLayout from "@components/layouts/CMSLayout";
import Login from "@pages/Login";
import { MODULES } from "@constants/menu";
import { renderRoutes } from "@utils/renderRoutes";
import { Auth, UnAuth } from "./ValidateAuth";

const NotFound = () => (
  <div className="h-dvh bg-platinum flex flex-col items-center justify-center">
    <span className="text-5xl font-bold text-jet">404</span>
    <p className="text-graphite mt-2">This page could not be found.</p>
  </div>
);

const Routers = () => {
  return (
    <Routes>
      {/* Public: login (redirects to dashboard if already signed in) */}
      <Route element={<UnAuth />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Protected: everything inside the CMS shell requires a valid token */}
      <Route element={<Auth />}>
        <Route element={<CMSLayout menu={MODULES} />}>
          {renderRoutes(MODULES)}
        </Route>
      </Route>

      {/* Root → dashboard (the Auth guard bounces to /login if needed) */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default Routers;
