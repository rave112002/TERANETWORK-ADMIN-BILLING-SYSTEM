import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tabs,
  Tag,
} from "antd";
import { RadarChartOutlined, ImportOutlined } from "@ant-design/icons";

import { useAuthStore } from "@store/useAuthStore";
import { useOlts } from "@services/query/useOltsQuery";
import { useNaps } from "@services/query/useNapsQuery";
import {
  useDiscoveryRuns,
  useDiscoveryItems,
} from "@services/query/useDiscoveryQuery";
import {
  useRunDiscovery,
  useImportItem,
} from "@services/mutation/useDiscoveryMutation";

const STATE_OPTIONS = [
  { value: "unprovisioned", label: "Unprovisioned" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "offline", label: "Offline" },
];

// Drop empty/undefined so we only send confirmed fields.
const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && v !== null),
  );

const SOURCE_COLORS = { olt: "geekblue", mikrotik: "purple" };
const STATUS_COLORS = { new: "green", matched: "blue", orphaned: "gold" };

// One-line human summary of a staged item's suggested/matched info.
const renderDetails = (item) => {
  const s = item.suggested;
  if (s) {
    if (item.source === "olt") {
      const loc = [s.pon && `PON ${s.pon}`, s.nap && `NAP ${s.nap}`, s.port && `PORT ${s.port}`]
        .filter(Boolean)
        .join(" · ");
      return [s.name, loc, s.account?.username && `↔ ${s.account.username}`]
        .filter(Boolean)
        .join("  ·  ");
    }
    // mikrotik account
    return [s.username, s.profile, s.mac ? `↔ ${s.mac}` : "no session"]
      .filter(Boolean)
      .join("  ·  ");
  }
  if (item.matched_entity) return `${item.matched_entity} #${item.matched_id}`;
  return "—";
};

const Discovery = () => {
  const role = useAuthStore((s) => s.user?.role);
  const canRun = ["super_admin", "noc"].includes(role);

  const canImport = ["super_admin", "billing", "noc"].includes(role);

  const { data: olts = [] } = useOlts();
  const { data: naps = [] } = useNaps();
  const { data: runs = [] } = useDiscoveryRuns();

  const [oltId, setOltId] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [bucket, setBucket] = useState("new");

  // Import modal state.
  const [importing, setImporting] = useState(null); // the item being imported
  const [form] = Form.useForm();

  const runMutation = useRunDiscovery({
    onSuccess: (data) => setSelectedRun(data?.data?.runId ?? null),
  });

  const closeImport = () => {
    setImporting(null);
    form.resetFields();
  };
  const importMutation = useImportItem({ onSuccess: closeImport });

  // Open the import modal, pre-filling the form from the discovered data.
  const openImport = (item) => {
    setImporting(item);
    const raw = item.raw ?? {};
    const s = item.suggested ?? {};
    if (item.source === "olt") {
      form.setFieldsValue({
        serialNo: raw.serialNo ?? "",
        mac: raw.mac ?? "",
        onuIndex: raw.onuIndex ?? "",
        napId: undefined,
        napPort: s.port ?? undefined,
        provisioningState: raw.online ? "active" : "unprovisioned",
      });
    } else {
      form.setFieldsValue({
        name: s.name ?? raw.comment ?? raw.username ?? "",
        email: "",
        phone: undefined,
        address: undefined,
        status: raw.disabled ? "inactive" : "active",
      });
    }
  };

  const submitImport = async () => {
    const values = await form.validateFields();
    importMutation.mutate({ id: importing.id, body: clean(values) });
  };

  const napOptions = naps.map((n) => ({ value: n.id, label: `${n.label} (#${n.id})` }));

  // Default to the newest run once runs load (unless one is already chosen).
  useEffect(() => {
    if (!selectedRun && runs.length > 0) setSelectedRun(runs[0].id);
  }, [runs, selectedRun]);

  const { data: items = [], isLoading: itemsLoading } = useDiscoveryItems(
    selectedRun,
    bucket,
  );

  const oltOptions = olts.map((o) => ({ value: o.id, label: o.name }));
  const runOptions = useMemo(
    () =>
      runs.map((r) => ({
        value: r.id,
        label: `Run #${r.id} — ${r.status} (${r.item_count} items)`,
      })),
    [runs],
  );

  const columns = [
    {
      title: "Source",
      dataIndex: "source",
      key: "source",
      render: (v) => <Tag color={SOURCE_COLORS[v]}>{v}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "match_status",
      key: "match_status",
      render: (v) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    },
    { title: "Key", dataIndex: "external_key", key: "external_key" },
    { title: "Details", key: "details", render: (_, item) => renderDetails(item) },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, item) =>
        item.match_status === "new" && canImport ? (
          <Button
            size="small"
            type="primary"
            ghost
            icon={<ImportOutlined />}
            onClick={() => openImport(item)}
          >
            Import {item.source === "olt" ? "ONU" : "customer"}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-jet">Device Discovery</h1>
          <p className="text-graphite mt-1">
            Read existing modems (OLT) and accounts (MikroTik), then review and
            import them. Devices are never modified.
          </p>
        </div>
      </div>

      {/* Run controls */}
      <div className="bg-white rounded-xl border border-platinum p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-graphite mb-1">OLT to sweep</div>
          <Select
            options={oltOptions}
            value={oltId}
            onChange={setOltId}
            placeholder="Select an OLT"
            style={{ width: 240 }}
            showSearch
            optionFilterProp="label"
          />
        </div>
        <Button
          type="primary"
          icon={<RadarChartOutlined />}
          disabled={!canRun || !oltId}
          loading={runMutation.isPending}
          onClick={() => runMutation.mutate({ oltId })}
        >
          Run discovery
        </Button>
        {!canRun && (
          <span className="text-ash text-sm">
            Only NOC / super admin can run a sweep.
          </span>
        )}

        <div className="ml-auto">
          <div className="text-xs text-graphite mb-1">Viewing run</div>
          <Select
            options={runOptions}
            value={selectedRun}
            onChange={setSelectedRun}
            placeholder="No runs yet"
            style={{ width: 280 }}
            notFoundContent={<Empty description="No runs yet" />}
          />
        </div>
      </div>

      {/* Buckets */}
      <div className="bg-white rounded-xl border border-platinum p-4">
        <Tabs
          activeKey={bucket}
          onChange={setBucket}
          items={[
            { key: "new", label: "New" },
            { key: "matched", label: "Matched" },
            { key: "orphaned", label: "Orphaned" },
          ]}
        />
        <Table
          rowKey="id"
          size="small"
          loading={itemsLoading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 20 }}
          locale={{
            emptyText: (
              <Empty
                description={
                  selectedRun ? "No items in this bucket" : "Run a discovery sweep to begin"
                }
              />
            ),
          }}
          expandable={{
            expandedRowRender: (item) => (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-graphite">Raw (from device)</div>
                  <pre className="bg-platinum/40 rounded p-2 text-xs whitespace-pre-wrap">
                    {JSON.stringify(item.raw, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-semibold text-graphite">Suggested</div>
                  <pre className="bg-platinum/40 rounded p-2 text-xs whitespace-pre-wrap">
                    {item.suggested ? JSON.stringify(item.suggested, null, 2) : "—"}
                  </pre>
                </div>
              </div>
            ),
          }}
        />
      </div>

      <Modal
        title={
          importing?.source === "olt"
            ? "Import ONU"
            : "Import customer from account"
        }
        open={!!importing}
        onCancel={closeImport}
        onOk={submitImport}
        okText="Import"
        confirmLoading={importMutation.isPending}
        width={560}
        destroyOnClose
      >
        <p className="text-graphite mb-4">
          Confirm or adjust the details below. This creates a live record and is
          audited. The devices are not modified.
        </p>
        <Form form={form} layout="vertical" requiredMark={false}>
          {importing?.source === "olt" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Form.Item
                  label="Serial number"
                  name="serialNo"
                  rules={[{ required: true, message: "Required" }]}
                >
                  <Input placeholder="ONU-SN-0001" />
                </Form.Item>
                <Form.Item label="MAC" name="mac">
                  <Input placeholder="30:c5:0f:d8:7f:2c" />
                </Form.Item>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Form.Item label="ONU index" name="onuIndex">
                  <Input placeholder="1/27" />
                </Form.Item>
                <Form.Item label="Provisioning state" name="provisioningState">
                  <Select options={STATE_OPTIONS} />
                </Form.Item>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Form.Item label="NAP" name="napId">
                  <Select
                    options={napOptions}
                    placeholder="Select NAP (optional)"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item label="NAP port" name="napPort">
                  <InputNumber min={0} max={255} className="w-full" />
                </Form.Item>
              </div>
            </>
          ) : (
            <>
              <Form.Item
                label="Customer name"
                name="name"
                rules={[{ required: true, message: "Required" }]}
              >
                <Input placeholder="Juan Dela Cruz" />
              </Form.Item>
              <Form.Item
                label="Email"
                name="email"
                extra="PPPoE accounts have no email; one is required because invoices are email-only."
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email" },
                ]}
              >
                <Input placeholder="customer@example.com" />
              </Form.Item>
              <div className="grid grid-cols-2 gap-4">
                <Form.Item label="Phone" name="phone">
                  <Input placeholder="09xx xxx xxxx" />
                </Form.Item>
                <Form.Item label="Status" name="status">
                  <Select
                    options={[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />
                </Form.Item>
              </div>
              <Form.Item label="Address" name="address">
                <Input placeholder="Street, Barangay, City" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Discovery;
