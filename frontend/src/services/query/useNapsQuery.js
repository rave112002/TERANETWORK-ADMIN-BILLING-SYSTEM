import { useQuery } from "@tanstack/react-query";
import { listNaps } from "@services/api/napsApi";

export const NAPS_QUERY_KEY = ["network", "naps"];

export const useNaps = () =>
  useQuery({
    queryKey: NAPS_QUERY_KEY,
    queryFn: () => listNaps(),
    select: (res) => res?.data ?? [],
  });
