import { defaultAxios, httpMethod } from "./axios";

/** System settings API — currently the DRY_RUN kill switch. */
const BASE = "/api/v1/system/settings";

/** GET the DRY_RUN state. Body: { data: { key, enabled } }. Any staff may read. */
export const getDryRun = async () => {
  const res = await defaultAxios(httpMethod.GET, `${BASE}/dry-run`);
  return res.data;
};

/** PUT the DRY_RUN state. super_admin only. */
export const setDryRun = async ({ enabled }) => {
  const res = await defaultAxios(httpMethod.PUT, `${BASE}/dry-run`, {
    data: { enabled },
  });
  return res.data;
};
