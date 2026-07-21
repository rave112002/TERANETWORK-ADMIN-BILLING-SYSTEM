import { useQuery } from "@tanstack/react-query";
import { listOlts } from "@services/api/oltsApi";

export const OLTS_QUERY_KEY = ["network", "olts"];

export const useOlts = () =>
  useQuery({
    queryKey: OLTS_QUERY_KEY,
    queryFn: listOlts,
    select: (res) => res?.data ?? [],
  });
