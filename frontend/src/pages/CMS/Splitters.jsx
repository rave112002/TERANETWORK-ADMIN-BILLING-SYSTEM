import { useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

import useTableColumns, { useDataBasedFilters } from "@hooks/useTableColumns";
import { useSplitters } from "@services/query/useSplittersQuery";
import { usePonPorts } from "@services/query/usePonPortsQuery";
import {
  useCreateSplitter,
  useUpdateSplitter,
  useDeleteSplitter,
} from "@services/mutation/useSplittersMutation";

const RATIO_OPTIONS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"].map(
  (v) => ({
    value: v,
    label: v,
  }),
);

const PARENT_TYPE_OPTIONS = [
  { value: "pon_port", label: "PON Port" },
  { value: "splitter", label: "Splitter" },
];

const Splitters = () => {
  const { data: splitters = [], isLoading } = useSplitters();
  const { data: ponPorts = [] } = usePonPorts();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  // Watch parent_type so the parent dropdown can switch its options.
  const parentType = Form.useWatch("parent_type", form);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateSplitter({ onSuccess: closeModal });
  const updateMutation = useUpdateSplitter({ onSuccess: closeModal });
  const deleteMutation = useDeleteSplitter();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ parent_type: "pon_port" });
    setModalOpen(true);
  };

  const openEdit = (splitter) => {
    setEditing(splitter);
    form.setFieldsValue(splitter);
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

  // Parent options depend on the selected parent type.
  const parentOptions =
    parentType === "splitter"
      ? splitters
          // A splitter can't be its own parent.
          .filter((s) => !editing || s.id !== editing.id)
          .map((s) => ({
            value: s.id,
            label: `Splitter #${s.id} · ${s.ratio}`,
          }))
      : ponPorts.map((p) => ({
          value: p.id,
          label: `${p.olt_name} · ${p.port_index}`,
        }));

  const ratioFilters = useDataBasedFilters(splitters, "ratio");

  const columns = [
    createColumn({ title: "ID", key: "id", isSearch: false, width: 70 }),
    createColumn({
      title: "Parent",
      key: "parent_type",
      isSearch: false,
      isSort: false,
      render: (_, r) => `${r.parent_type} #${r.parent_id}`,
    }),
    createColumn({
      title: "Ratio",
      key: "ratio",
      isSearch: false,
      ...ratioFilters,
      render: (v) => <Tag>{v}</Tag>,
    }),
    createColumn({
      title: "Label",
      key: "label",
      ...renderInputSearch("label"),
    }),
    createColumn({
      title: "Location",
      key: "location",
      ...renderInputSearch("location"),
    }),
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, s) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(s)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this splitter?"
            description="Blocked if NAPs still reference it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate({ id: s.id })}
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
          <h1 className="text-2xl font-semibold text-jet">Splitters</h1>
          <p className="text-graphite mt-1">
            Passive optical splitters (can cascade off a PON port or another
            splitter).
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Splitter
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={splitters}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit Splitter" : "New Splitter"}
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
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Parent type"
              name="parent_type"
              rules={[{ required: true }]}
            >
              <Select
                options={PARENT_TYPE_OPTIONS}
                // Reset the chosen parent when the type changes.
                onChange={() => form.setFieldValue("parent_id", undefined)}
              />
            </Form.Item>
            <Form.Item
              label="Parent"
              name="parent_id"
              rules={[{ required: true, message: "Select a parent" }]}
            >
              <Select
                options={parentOptions}
                placeholder="Select parent"
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>

          <Form.Item label="Ratio" name="ratio" rules={[{ required: true }]}>
            <Select options={RATIO_OPTIONS} placeholder="Split ratio" />
          </Form.Item>

          <Form.Item label="Label" name="label">
            <Input placeholder="e.g. Street A primary" />
          </Form.Item>
          <Form.Item label="Location" name="location">
            <Input placeholder="e.g. Pole 12, Main St" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Splitters;
