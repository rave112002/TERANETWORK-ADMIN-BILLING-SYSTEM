import { useQuery } from "@tanstack/react-query";
import { listOnus } from "@services/api/onusApi";

export const ONUS_QUERY_KEY = ["network", "onus"];

export const useOnus = () =>
  useQuery({
    queryKey: ONUS_QUERY_KEY,
    queryFn: () => listOnus({ params: { limit: 100, offset: 0 } }),
    select: (res) => res?.data?.items ?? [],
  });
