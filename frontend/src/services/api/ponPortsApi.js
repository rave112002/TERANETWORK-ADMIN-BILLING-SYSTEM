import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/network/pon-ports";

/** GET all PON ports (optionally filter by ?olt_id). Returns { ..., data: [] }. */
export const listPonPorts = async ({ params } = {}) => {
  const res = await defaultAxios(httpMethod.GET, BASE, { params });
  return res.data;
};

export const createPonPort = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

export const updatePonPort = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

export const deletePonPort = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
