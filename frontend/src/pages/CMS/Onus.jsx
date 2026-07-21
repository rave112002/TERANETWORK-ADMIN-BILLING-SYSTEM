import { useState } from "react";
import {
  Button,
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
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

import useTableColumns, { useDataBasedFilters } from "@hooks/useTableColumns";
import { useOnus } from "@services/query/useOnusQuery";
import { useNaps } from "@services/query/useNapsQuery";
import { useOlts } from "@services/query/useOltsQuery";
import { usePonPorts } from "@services/query/usePonPortsQuery";
import {
  useCreateOnu,
  useUpdateOnu,
  useDeleteOnu,
} from "@services/mutation/useOnusMutation";

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

const STATE_OPTIONS = [
  { value: "unprovisioned", label: "Unprovisioned" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "offline", label: "Offline" },
];
const STATE_COLORS = {
  unprovisioned: "default",
  active: "green",
  suspended: "red",
  offline: "gold",
};

const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== "" && v !== null,
    ),
  );

const Onus = () => {
  const { data: onus = [], isLoading } = useOnus();
  const { data: naps = [] } = useNaps();
  const { data: olts = [] } = useOlts();
  const { data: ponPorts = [] } = usePonPorts();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateOnu({ onSuccess: closeModal });
  const updateMutation = useUpdateOnu({ onSuccess: closeModal });
  const deleteMutation = useDeleteOnu();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ provisioning_state: "unprovisioned" });
    setModalOpen(true);
  };

  const openEdit = (onu) => {
    setEditing(onu);
    form.setFieldsValue(onu);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const body = clean(values);
    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate({ body });
    }
  };

  const napOptions = naps.map((n) => ({
    value: n.id,
    label: `${n.label} (#${n.id})`,
  }));
  const oltOptions = olts.map((o) => ({ value: o.id, label: o.name }));
  const ponOptions = ponPorts.map((p) => ({
    value: p.id,
    label: `${p.olt_name} · ${p.port_index}`,
  }));

  const stateFilters = useDataBasedFilters(onus, "provisioning_state");

  const columns = [
    createColumn({
      title: "Serial",
      key: "serial_no",
      ...renderInputSearch("serial_no", true),
    }),
    createColumn({
      title: "MAC",
      key: "mac",
      ...renderInputSearch("mac", true),
    }),
    createColumn({
      title: "Model",
      key: "model",
      isSearch: false,
      isSort: false,
    }),
    createColumn({
      title: "NAP",
      key: "nap_label",
      isSearch: false,
      isSort: false,
    }),
    createColumn({
      title: "OLT",
      key: "olt_name",
      isSearch: false,
      isSort: false,
    }),
    createColumn({
      title: "State",
      key: "provisioning_state",
      isSearch: false,
      ...stateFilters,
      render: (v) => <Tag color={STATE_COLORS[v]}>{v}</Tag>,
    }),
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, onu) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(onu)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this ONU?"
            description="Blocked if a subscription references it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate({ id: onu.id })}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-jet">ONUs</h1>
          <p className="text-graphite mt-1">
            Subscriber modems (the fiber tree's leaves).
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New ONU
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={onus}
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit ONU" : "New ONU"}
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
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Serial number"
              name="serial_no"
              rules={[{ required: true, message: "Required" }]}
            >
              <Input placeholder="ONU-SN-0001" />
            </Form.Item>
            <Form.Item
              label="MAC address"
              name="mac"
              rules={[
                {
                  pattern: MAC_PATTERN,
                  message: "Invalid MAC (aa:bb:cc:dd:ee:ff)",
                },
              ]}
            >
              <Input placeholder="30:C5:0F:D8:7F:2C" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="Model" name="model">
              <Input placeholder="Huawei EG8145V5" />
            </Form.Item>
            <Form.Item label="ONU index" name="onu_index">
              <Input placeholder="1/27" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="NAP" name="nap_id">
              <Select
                options={napOptions}
                placeholder="Select NAP"
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item label="NAP port" name="nap_port">
              <InputNumber min={0} max={255} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="OLT" name="olt_id">
              <Select
                options={oltOptions}
                placeholder="Select OLT"
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item label="PON port" name="pon_port_id">
              <Select
                options={ponOptions}
                placeholder="Select PON port"
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>

          <Form.Item
            label="Provisioning state"
            name="provisioning_state"
            rules={[{ required: true }]}
          >
            <Select options={STATE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Onus;
