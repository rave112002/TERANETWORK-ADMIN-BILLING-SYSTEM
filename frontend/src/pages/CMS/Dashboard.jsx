import { Card, Tag } from "antd";
import { useAuthStore } from "@store/useAuthStore";

// Friendly labels + subtle tag colors per role (color used only for meaning).
const ROLE_LABELS = {
  super_admin: { label: "Super Admin", color: "geekblue" },
  billing: { label: "Billing", color: "green" },
  noc: { label: "NOC / Technician", color: "gold" },
  auditor: { label: "Auditor", color: "default" },
};

const Dashboard = () => {
  const user = useAuthStore((s) => s.user);
  const roleInfo = ROLE_LABELS[user?.role] ?? { label: user?.role, color: "default" };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-jet">
        Welcome back{user?.name ? `, ${user.name}` : ""}
      </h1>
      <p className="text-graphite mt-1">
        You are signed in to the TeraNetwork admin console.
      </p>

      <Card className="mt-6 max-w-md border-platinum" size="small">
        <div className="flex flex-col gap-3">
          <Row label="Name" value={user?.name} />
          <Row label="Email" value={user?.email} />
          <div className="flex justify-between items-center">
            <span className="text-ash text-sm">Role</span>
            <Tag color={roleInfo.color} className="m-0">
              {roleInfo.label}
            </Tag>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-ash text-sm">{label}</span>
    <span className="text-jet font-medium">{value ?? "—"}</span>
  </div>
);

export default Dashboard;
