import { defaultAxios, httpMethod } from "./axios";

const BASE = "/api/v1/cms/plans";

/** GET all plans. Returns the response body: { success, message, data: Plan[] } */
export const listPlans = async () => {
  const res = await defaultAxios(httpMethod.GET, BASE);
  return res.data;
};

/** POST a new plan. */
export const createPlan = async ({ body }) => {
  const res = await defaultAxios(httpMethod.POST, BASE, { data: body });
  return res.data;
};

/** PATCH an existing plan by id. */
export const updatePlan = async ({ id, body }) => {
  const res = await defaultAxios(httpMethod.PATCH, `${BASE}/${id}`, {
    data: body,
  });
  return res.data;
};

/** DELETE (soft-deactivate) a plan by id. */
export const deletePlan = async ({ id }) => {
  const res = await defaultAxios(httpMethod.DELETE, `${BASE}/${id}`);
  return res.data;
};
