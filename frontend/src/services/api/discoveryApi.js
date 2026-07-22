import { defaultAxios, httpMethod } from "./axios";

/** Device Discovery API (§3.1.1). */
const BASE = "/api/v1/discovery";

/** Run a sweep against an OLT (+ the MikroTik). Returns { runId, summary, itemCount }. */
export const runDiscovery = async ({ oltId }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/run`, {
    data: { oltId },
  });
  return res.data;
};

/** List recent discovery runs (newest first). */
export const listRuns = async () => {
  const res = await defaultAxios(httpMethod.GET, `${BASE}/runs`);
  return res.data;
};

/** List staged items for a run, optionally filtered by bucket. */
export const listRunItems = async ({ runId, params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, `${BASE}/runs/${runId}/items`, {
    params,
  });
  return res.data;
};

/** Import a staged 'new' item into the live tables (ONU or customer). */
export const importItem = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.POST, `${BASE}/items/${id}/import`, {
    data: body,
  });
  return res.data;
};
