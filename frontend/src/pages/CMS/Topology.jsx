import { useMemo, useState } from "react";
import { Button, Card, Empty, Modal, Spin, Tag, Tree, Tooltip } from "antd";
import NetworkMap from "@components/common/NetworkMap";
import { useOlts } from "@services/query/useOltsQuery";
import { usePonPorts } from "@services/query/usePonPortsQuery";
import { useSplitters } from "@services/query/useSplittersQuery";
import { useNaps } from "@services/query/useNapsQuery";
import { useOnus } from "@services/query/useOnusQuery";
import { Expand } from "lucide-react";

const ONU_STATE_COLORS = {
  unprovisioned: "default",
  active: "green",
  suspended: "red",
  offline: "gold",
};

const Topology = () => {
  const oltsQ = useOlts();
  const ponQ = usePonPorts();
  const splittersQ = useSplitters();
  const napsQ = useNaps();
  const onusQ = useOnus();

  const naps = napsQ.data ?? []; // used by the map
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const loading =
    oltsQ.isLoading ||
    ponQ.isLoading ||
    splittersQ.isLoading ||
    napsQ.isLoading ||
    onusQ.isLoading;

  // Build the OLT → PON → splitter(s) → NAP → ONU tree. Splitters can cascade,
  // so the splitter builder recurses into child splitters.
  const treeData = useMemo(() => {
    const olts = oltsQ.data ?? [];
    const ponPorts = ponQ.data ?? [];
    const splitters = splittersQ.data ?? [];
    const napList = napsQ.data ?? [];
    const onus = onusQ.data ?? [];

    const childSplitters = (type, id) =>
      splitters.filter((s) => s.parent_type === type && s.parent_id === id);
    const napsOf = (splitterId) =>
      napList.filter((n) => n.splitter_id === splitterId);
    const onusOf = (napId) => onus.filter((o) => o.nap_id === napId);

    const onuNode = (o) => ({
      key: `onu-${o.id}`,
      title: (
        <span>
          ONU {o.serial_no}{" "}
          <Tag color={ONU_STATE_COLORS[o.provisioning_state]} className="ml-1">
            {o.provisioning_state}
          </Tag>
        </span>
      ),
    });

    const napNode = (n) => ({
      key: `nap-${n.id}`,
      title: `NAP · ${n.label}`,
      children: onusOf(n.id).map(onuNode),
    });

    const splitterNode = (s) => ({
      key: `sp-${s.id}`,
      title: `Splitter #${s.id} · ${s.ratio}`,
      children: [
        ...childSplitters("splitter", s.id).map(splitterNode),
        ...napsOf(s.id).map(napNode),
      ],
    });

    const ponNode = (p) => ({
      key: `pon-${p.id}`,
      title: `PON · ${p.port_index}`,
      children: childSplitters("pon_port", p.id).map(splitterNode),
    });

    return olts.map((olt) => ({
      key: `olt-${olt.id}`,
      title: `OLT · ${olt.name}`,
      children: ponPorts.filter((p) => p.olt_id === olt.id).map(ponNode),
    }));
  }, [oltsQ.data, ponQ.data, splittersQ.data, napsQ.data, onusQ.data]);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-jet">Network Topology</h1>
        <p className="text-graphite mt-1">
          The full OLT → PON → splitter → NAP → ONU tree, and NAP locations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-1 gap-4 mt-4 lg:flex-1 lg:min-h-0">
        <Card
          title="Topology tree"
          className="border-platinum flex flex-col"
          styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}
        >
          {loading ? (
            <div className="flex justify-center py-10">
              <Spin />
            </div>
          ) : treeData.length ? (
            <Tree
              treeData={treeData}
              defaultExpandAll
              showLine
              selectable={false}
              className="text-sm"
            />
          ) : (
            <Empty description="No OLTs yet" />
          )}
        </Card>

        <Card
          title="NAP map"
          className="border-platinum flex flex-col"
          styles={{ body: { padding: 0, flex: 1, minHeight: 0 } }}
          extra={
            <Tooltip title="Expand map">
              <Button
                type="text"
                size="small"
                icon={<Expand size={16} />}
                onClick={() => setMapModalOpen(true)}
              />
            </Tooltip>
          }
        >
          <div className="h-[500px] lg:h-full w-full overflow-hidden rounded-b-lg">
            <NetworkMap naps={naps} />
          </div>
        </Card>
      </div>

      {/* Expanded map view. Rendered only while open (destroyOnClose) so Leaflet
          initializes at the modal's full size. */}
      <Modal
        title="NAP map"
        open={mapModalOpen}
        onCancel={() => setMapModalOpen(false)}
        footer={null}
        width="90vw"
        centered
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        <div className="h-[80vh] w-full overflow-hidden rounded-lg">
          {mapModalOpen && <NetworkMap naps={naps} />}
        </div>
      </Modal>
    </div>
  );
};

export default Topology;
