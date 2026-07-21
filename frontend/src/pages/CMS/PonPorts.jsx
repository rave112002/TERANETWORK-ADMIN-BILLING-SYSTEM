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
import { usePonPorts } from "@services/query/usePonPortsQuery";
import { useOlts } from "@services/query/useOltsQuery";
import {
  useCreatePonPort,
  useUpdatePonPort,
  useDeletePonPort,
} from "@services/mutation/usePonPortsMutation";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "down", label: "Down" },
  { value: "reserved", label: "Reserved" },
];
const STATUS_COLORS = { active: "green", down: "red", reserved: "gold" };

const PonPorts = () => {
  const { data: ports = [], isLoading } = usePonPorts();
  const { data: olts = [] } = useOlts(); // for the parent OLT dropdown
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreatePonPort({ onSuccess: closeModal });
  const updateMutation = useUpdatePonPort({ onSuccess: closeModal });
  const deleteMutation = useDeletePonPort();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ capacity: 64, status: "active" });
    setModalOpen(true);
  };

  const openEdit = (port) => {
    setEditing(port);
    form.setFieldsValue(port);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      updateMutation.mutate({ id: editing.id, body: values });
    } else {
      createMutation.mutate({ body: values });
    }
  };

  const oltFilters = useDataBasedFilters(ports, "olt_name");
  const statusFilters = useDataBasedFilters(ports, "status");

  const oltOptions = olts.map((o) => ({ value: o.id, label: o.name }));

  const columns = [
    createColumn({
      title: "OLT",
      key: "olt_name",
      isSearch: false,
      ...oltFilters,
    }),
    createColumn({
      title: "Port index",
      key: "port_index",
      ...renderInputSearch("port_index"),
    }),
    createColumn({ title: "Capacity", key: "capacity", isSearch: false }),
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
      render: (_, port) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(port)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this PON port?"
            description="Blocked if splitters/ONUs still reference it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate({ id: port.id })}
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
          <h1 className="text-2xl font-semibold text-jet">PON Ports</h1>
          <p className="text-graphite mt-1">
            OLT ports that feed subscriber trees.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New PON Port
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={ports}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit PON Port" : "New PON Port"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText={editing ? "Save changes" : "Create"}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          className="mt-4"
        >
          <Form.Item
            label="OLT"
            name="olt_id"
            rules={[{ required: true, message: "Select an OLT" }]}
          >
            <Select
              options={oltOptions}
              placeholder="Select the parent OLT"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            label="Port index"
            name="port_index"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input placeholder="e.g. 0/1/1" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Capacity"
              name="capacity"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={65535} className="w-full" />
            </Form.Item>
            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true }]}
            >
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default PonPorts;
