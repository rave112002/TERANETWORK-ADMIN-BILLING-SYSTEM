import { Routes, Route } from "react-router-dom";
import CMSLayout from "@components/layouts/CMSLayout";
import Login from "@pages/Login";
import Home from "@pages/CMS/Home";
import SecondPage from "@pages/CMS/Feature";
import { MODULES } from "@constants/menu";
import { renderRoutes } from "@utils/renderRoutes";


const NotFound = () => (
  <div className="h-dvh bg-header flex flex-col items-center justify-center">
    <span className="text-5xl font-bold text-white text-shadow-lg/30">
      404 - Page Not Found
    </span>
    <p className="text-white mt-2">Return to home using the menu.</p>
  </div>
);

const Routers = () => {
  return (
    <Routes>
      {/* Default route */}
      <Route path="/" element={<Login />} />

      {/* ENABLE THIS WHEN LOGIN IS AVAILABLE */}
      {/* <Route
        element={
          <UnAuth
            store={useAuthStore}
            redirect={(state) => getRedirectByRole(state.roles)}
          />
        }
      >
        <Route path="/" index element={<Login />} />
      </Route> */}

      {/* ADMIN ROUTES */}
      {/* UNCOMMENT PARENT ROUTE FOR AUTH */}
      {/* <Route
        element={
          <Auth store={useAuthStore} redirect="/" allowedRoles={["ADMIN"]} />
        }
      > */}
      <Route element={<CMSLayout admin menu={MODULES} />}>
        {renderRoutes(MODULES)}
      </Route>
      {/* </Route> */}

      {/* Catch-all 404 with redirect */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default Routers;
