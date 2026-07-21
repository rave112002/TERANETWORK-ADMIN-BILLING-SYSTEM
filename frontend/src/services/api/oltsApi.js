import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/network/olts";

/** GET all OLTs (metadata only — credentials are never returned). */
export const listOlts = async () => {
  const res = await defaultAxios(httpMethod.GET, BASE);
  return res.data;
};

export const createOlt = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateOlt = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

/** DELETE = mark the OLT retired (soft delete). */
export const deleteOlt = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
