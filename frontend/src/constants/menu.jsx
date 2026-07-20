import { Suspense, lazy } from "react";
import { ComponentLoader } from "@components/common/LoadingFallback";
import { Dock, LayoutDashboard } from "lucide-react";

const Home = lazy(() => import("@pages/CMS/Home"));
const Feature = lazy(() => import("@pages/CMS/Feature"));
const Accounts = lazy(() => import("@pages/CMS/Accounts"));

export const MODULES = [
  {
    type: "item",
    icon: <LayoutDashboard size={20} className="mr-1" />,
    value: "dashboard",
    label: "Dashboard",
    link: "/admin/dashboard",
    element: (
      <Suspense fallback={<ComponentLoader />}>
        <Home />
      </Suspense>
    ),
  },
  {
    type: "item",
    icon: <Dock size={20} className="mr-1" />,
    value: "feature",
    label: "Feature",
    link: "/admin/feature",
    element: (
      <Suspense fallback={<ComponentLoader />}>
        <Feature />
      </Suspense>
    ),
  },
  {
    type: "item",
    icon: <Dock size={20} className="mr-1" />,
    value: "accounts",
    label: "Accounts",
    link: "/admin/accounts",
    element: (
      <Suspense fallback={<ComponentLoader />}>
        <Accounts />
      </Suspense>
    ),
  },
];
