import { Suspense, lazy } from "react";
import { ComponentLoader } from "@components/common/LoadingFallback";
import {
  LayoutDashboard,
  Package,
  Users,
  Server,
  Split,
  GitBranch,
  Box,
  Router,
  Network,
  Wallet,
  Repeat,
  Waypoints,
} from "lucide-react";

const Dashboard = lazy(() => import("@pages/CMS/Dashboard"));
const Topology = lazy(() => import("@pages/CMS/Topology"));
const Plans = lazy(() => import("@pages/CMS/Plans"));
const Customers = lazy(() => import("@pages/CMS/Customers"));
const Subscriptions = lazy(() => import("@pages/CMS/Subscriptions"));
const Olts = lazy(() => import("@pages/CMS/Olts"));
const PonPorts = lazy(() => import("@pages/CMS/PonPorts"));
const Splitters = lazy(() => import("@pages/CMS/Splitters"));
const Naps = lazy(() => import("@pages/CMS/Naps"));
const Onus = lazy(() => import("@pages/CMS/Onus"));

// Sidebar + route config. Items with `children` render as a collapsible group;
// the parent has no `link`, only its children have routes. `value` doubles as
// the menu key and (for leaf items) the last URL segment.
export const MODULES = [
  {
    type: "item",
    icon: <LayoutDashboard size={18} className="mr-1" />,
    value: "dashboard",
    label: "Dashboard",
    link: "/dashboard",
    element: (
      <Suspense fallback={<ComponentLoader />}>
        <Dashboard />
      </Suspense>
    ),
  },
  {
    type: "group",
    icon: <Wallet size={18} className="mr-1" />,
    value: "billing",
    label: "Billing",
    children: [
      {
        type: "item",
        icon: <Package size={18} className="mr-1" />,
        value: "plans",
        label: "Service Plans",
        link: "/plans",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Plans />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Users size={18} className="mr-1" />,
        value: "customers",
        label: "Customers",
        link: "/customers",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Customers />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Repeat size={18} className="mr-1" />,
        value: "subscriptions",
        label: "Subscriptions",
        link: "/subscriptions",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Subscriptions />
          </Suspense>
        ),
      },
    ],
  },
  {
    type: "group",
    icon: <Network size={18} className="mr-1" />,
    value: "network",
    label: "Network",
    children: [
      {
        type: "item",
        icon: <Waypoints size={18} className="mr-1" />,
        value: "topology",
        label: "Topology",
        link: "/topology",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Topology />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Server size={18} className="mr-1" />,
        value: "olts",
        label: "OLTs",
        link: "/olts",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Olts />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Split size={18} className="mr-1" />,
        value: "pon-ports",
        label: "PON Ports",
        link: "/pon-ports",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <PonPorts />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <GitBranch size={18} className="mr-1" />,
        value: "splitters",
        label: "Splitters",
        link: "/splitters",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Splitters />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Box size={18} className="mr-1" />,
        value: "naps",
        label: "NAPs",
        link: "/naps",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Naps />
          </Suspense>
        ),
      },
      {
        type: "item",
        icon: <Router size={18} className="mr-1" />,
        value: "onus",
        label: "ONUs",
        link: "/onus",
        element: (
          <Suspense fallback={<ComponentLoader />}>
            <Onus />
          </Suspense>
        ),
      },
    ],
  },
];
