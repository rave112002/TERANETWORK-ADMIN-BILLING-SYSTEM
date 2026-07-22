import { Alert } from "antd";

import { useDryRun } from "@services/query/useSystemQuery";

/**
 * A full-width warning shown to EVERYONE while DRY_RUN is on, so nobody is
 * confused when a disconnect/reconnect "does nothing" (it's only logged).
 */
const DryRunBanner = () => {
  const { data: enabled = false } = useDryRun();
  if (!enabled) return null;

  return (
    <Alert
      banner
      showIcon
      type="warning"
      message="Dry-run mode is ON — ONU device actions are logged but not executed."
    />
  );
};

export default DryRunBanner;
