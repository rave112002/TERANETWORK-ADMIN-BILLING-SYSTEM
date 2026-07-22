import { Switch, Tooltip } from "antd";

import { useAuthStore } from "@store/useAuthStore";
import { useDryRun } from "@services/query/useSystemQuery";
import { useSetDryRun } from "@services/mutation/useSystemMutation";

/**
 * Header control for the global DRY_RUN kill switch. Only super_admin can see /
 * flip it; everyone else just sees the banner (DryRunBanner) when it's on.
 */
const DryRunToggle = () => {
  const role = useAuthStore((s) => s.user?.role);
  const { data: enabled = false, isLoading } = useDryRun();
  const setMutation = useSetDryRun();

  if (role !== "super_admin") return null;

  return (
    <Tooltip title="When on, ONU device actions are logged but NOT executed">
      <span className="flex items-center gap-2 text-sm text-graphite">
        Dry-run
        <Switch
          size="small"
          checked={enabled}
          loading={isLoading || setMutation.isPending}
          onChange={(value) => setMutation.mutate({ enabled: value })}
        />
      </span>
    </Tooltip>
  );
};

export default DryRunToggle;
