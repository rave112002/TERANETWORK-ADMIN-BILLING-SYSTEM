import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/network/onus";

/** GET ONUs. Backend supports ?search=&nap_id=&olt_id=&provisioning_state=&limit=&offset=
 * Returns body: { ..., data: { items, total, limit, offset } } */
export const listOnus = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createOnu = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updateOnu = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

export const deleteOnu = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
