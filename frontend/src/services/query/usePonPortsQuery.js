import { useQuery } from "@tanstack/react-query";
import { listPonPorts } from "@services/api/ponPortsApi";

export const PON_PORTS_QUERY_KEY = ["network", "pon-ports"];

export const usePonPorts = () =>
  useQuery({
    queryKey: PON_PORTS_QUERY_KEY,
    queryFn: () => listPonPorts(),
    select: (res) => res?.data ?? [],
  });
