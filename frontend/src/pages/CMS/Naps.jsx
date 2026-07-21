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
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

import useTableColumns from "@hooks/useTableColumns";
import { useNaps } from "@services/query/useNapsQuery";
import { useSplitters } from "@services/query/useSplittersQuery";
import {
  useCreateNap,
  useUpdateNap,
  useDeleteNap,
} from "@services/mutation/useNapsMutation";

const { TextArea } = Input;

const Naps = () => {
  const { data: naps = [], isLoading } = useNaps();
  const { data: splitters = [] } = useSplitters();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateNap({ onSuccess: closeModal });
  const updateMutation = useUpdateNap({ onSuccess: closeModal });
  const deleteMutation = useDeleteNap();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ total_ports: 8 });
    setModalOpen(true);
  };

  const openEdit = (nap) => {
    setEditing(nap);
    form.setFieldsValue(nap);
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

  const splitterOptions = splitters.map((s) => ({
    value: s.id,
    label: `Splitter #${s.id} · ${s.ratio}`,
  }));

  const columns = [
    createColumn({
      title: "Label",
      key: "label",
      ...renderInputSearch("label"),
    }),
    createColumn({
      title: "Splitter",
      key: "splitter_id",
      isSearch: false,
      isSort: false,
      render: (_, r) => `#${r.splitter_id} · ${r.splitter_ratio ?? ""}`,
    }),
    createColumn({ title: "Ports", key: "total_ports", isSearch: false }),
    createColumn({
      title: "GPS",
      key: "gps_lat",
      isSearch: false,
      isSort: false,
      render: (_, r) => `${r.gps_lat}, ${r.gps_lng}`,
    }),
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, nap) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(nap)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this NAP?"
            description="Blocked if ONUs still reference it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate({ id: nap.id })}
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
          <h1 className="text-2xl font-semibold text-jet">NAPs</h1>
          <p className="text-graphite mt-1">
            Field distribution boxes where drop cables terminate.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New NAP
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={naps}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit NAP" : "New NAP"}
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
            label="Splitter"
            name="splitter_id"
            rules={[{ required: true, message: "Select a splitter" }]}
          >
            <Select
              options={splitterOptions}
              placeholder="Select parent splitter"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Label"
              name="label"
              rules={[{ required: true, message: "Required" }]}
            >
              <Input placeholder="e.g. NAP-1 Street A" />
            </Form.Item>
            <Form.Item
              label="Total ports"
              name="total_ports"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={255} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="GPS latitude"
              name="gps_lat"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber
                min={-90}
                max={90}
                step={0.0001}
                className="w-full"
                placeholder="14.601"
              />
            </Form.Item>
            <Form.Item
              label="GPS longitude"
              name="gps_lng"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber
                min={-180}
                max={180}
                step={0.0001}
                className="w-full"
                placeholder="120.985"
              />
            </Form.Item>
          </div>

          <Form.Item label="Notes" name="notes">
            <TextArea rows={2} placeholder="Optional notes" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Naps;
