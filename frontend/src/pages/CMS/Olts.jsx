import { useState } from "react";
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { PlusOutlined, EditOutlined, StopOutlined } from "@ant-design/icons";

import useTableColumns, { useDataBasedFilters } from "@hooks/useTableColumns";
import { useOlts } from "@services/query/useOltsQuery";
import {
  useCreateOlt,
  useUpdateOlt,
  useDeleteOlt,
} from "@services/mutation/useOltsMutation";

const VENDOR_OPTIONS = [
  "hsgq",
  "huawei",
  "zte",
  "fiberhome",
  "vsol",
  "bdcom",
  "mock",
  "other",
].map((v) => ({ value: v, label: v.toUpperCase() }));

const PROTOCOL_OPTIONS = ["ssh", "telnet", "snmp", "tr069"].map((v) => ({
  value: v,
  label: v.toUpperCase(),
}));

const PON_OPTIONS = [
  { value: "epon", label: "EPON" },
  { value: "gpon", label: "GPON" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

const STATUS_COLORS = {
  active: "green",
  maintenance: "gold",
  retired: "default",
};

// Drop empty strings / undefined so we don't send blanks.
const stripEmpty = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  );

const Olts = () => {
  const { data: olts = [], isLoading } = useOlts();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateOlt({ onSuccess: closeModal });
  const updateMutation = useUpdateOlt({ onSuccess: closeModal });
  const deleteMutation = useDeleteOlt();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      vendor: "hsgq",
      pon_technology: "epon",
      protocol: "telnet",
      port: 23,
      status: "active",
      max_concurrent_sessions: 1,
    });
    setModalOpen(true);
  };

  const openEdit = (olt) => {
    setEditing(olt);
    // No credentials come back from the API, so those fields stay blank.
    form.setFieldsValue(olt);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const { credentials, ...rest } = values;
    const body = stripEmpty(rest);

    const cred = stripEmpty(credentials || {});
    if (editing) {
      // Only send credentials if the user actually entered new ones.
      if (cred.username || cred.password) body.credentials = cred;
    } else {
      body.credentials = cred;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate({ body });
    }
  };

  const vendorFilters = useDataBasedFilters(olts, "vendor");
  const statusFilters = useDataBasedFilters(olts, "status");

  const columns = [
    createColumn({ title: "Name", key: "name", ...renderInputSearch("name") }),
    createColumn({
      title: "Vendor",
      key: "vendor",
      isSearch: false,
      ...vendorFilters,
      render: (v) => v?.toUpperCase(),
    }),
    createColumn({
      title: "Host",
      key: "host",
      ...renderInputSearch("host"),
      render: (_, r) => `${r.host}:${r.port}`,
    }),
    createColumn({
      title: "Protocol",
      key: "protocol",
      isSearch: false,
      isSort: false,
      render: (v) => v?.toUpperCase(),
    }),
    createColumn({
      title: "PON",
      key: "pon_technology",
      isSearch: false,
      isSort: false,
      render: (v) => v?.toUpperCase(),
    }),
    createColumn({
      title: "Status",
      key: "status",
      isSearch: false,
      ...statusFilters,
      render: (v) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    }),
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, olt) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(olt)}
          >
            Edit
          </Button>
          {olt.status !== "retired" ? (
            <Popconfirm
              title="Retire this OLT?"
              description="It stays in records but is marked retired."
              okText="Retire"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate({ id: olt.id })}
            >
              <Button size="small" type="text" danger icon={<StopOutlined />}>
                Retire
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const credRequired = !editing;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-jet">OLTs</h1>
          <p className="text-graphite mt-1">
            Optical Line Terminals. Credentials are encrypted and never shown.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New OLT
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={olts}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit OLT" : "New OLT"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editing ? "Save changes" : "Create"}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. HSGQ-Core-01" />
          </Form.Item>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item
              label="Vendor"
              name="vendor"
              rules={[{ required: true }]}
            >
              <Select options={VENDOR_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="PON"
              name="pon_technology"
              rules={[{ required: true }]}
            >
              <Select options={PON_OPTIONS} />
            </Form.Item>
            <Form.Item label="Model" name="model">
              <Input placeholder="XE04I" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item
              label="Host"
              name="host"
              rules={[{ required: true, message: "Host is required" }]}
              className="col-span-2"
            >
              <Input placeholder="192.168.88.10" />
            </Form.Item>
            <Form.Item label="Port" name="port" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item
              label="Protocol"
              name="protocol"
              rules={[{ required: true }]}
            >
              <Select options={PROTOCOL_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true }]}
            >
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
            <Form.Item label="Max sessions" name="max_concurrent_sessions">
              <InputNumber min={1} max={255} className="w-full" />
            </Form.Item>
          </div>

          <Form.Item label="Site" name="site">
            <Input placeholder="Main POP" />
          </Form.Item>

          <Divider className="!my-3" />
          <p className="text-sm text-graphite mb-3">
            Device credentials{" "}
            {editing && (
              <span className="text-ash">(leave blank to keep current)</span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Username"
              name={["credentials", "username"]}
              rules={
                credRequired ? [{ required: true, message: "Required" }] : []
              }
            >
              <Input placeholder="root" autoComplete="off" />
            </Form.Item>
            <Form.Item
              label="Password"
              name={["credentials", "password"]}
              rules={
                credRequired ? [{ required: true, message: "Required" }] : []
              }
            >
              <Input.Password
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Form.Item>
          </div>

          <Form.Item
            label="Enable password (optional)"
            name={["credentials", "enablePassword"]}
          >
            <Input.Password
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Olts;
