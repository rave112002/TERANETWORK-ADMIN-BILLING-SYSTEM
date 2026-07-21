import { useQuery } from "@tanstack/react-query";
import { listSplitters } from "@services/api/splittersApi";

export const SPLITTERS_QUERY_KEY = ["network", "splitters"];

export const useSplitters = () =>
  useQuery({
    queryKey: SPLITTERS_QUERY_KEY,
    queryFn: () => listSplitters(),
    select: (res) => res?.data ?? [],
  });
