import { defaultAxios, httpMethod } from "./axios";

/**
 * Manual ONU provisioning API.
 *
 * The POST actions ENQUEUE a job (the server returns 202 + { jobId, deduped });
 * the provisioning worker does the actual device work. So a successful call
 * means "queued", not "done" — watch the action logs for the real result.
 */
const BASE = "/api/v1/network/onus";

export const deactivateOnu = async ({ id }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/${id}/deactivate`);
  return res.data;
};

export const activateOnu = async ({ id }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/${id}/activate`);
  return res.data;
};

export const statusOnu = async ({ id }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/${id}/status`);
  return res.data;
};

/** GET the ONU's device-action history (newest first). */
export const listActionLogs = async ({ id, params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, `${BASE}/${id}/action-logs`, {
    params,
  });
  return res.data;
};
