import { useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import useTableColumns, {
  useDataBasedFilters,
  COLUMN_SORTER_TYPES,
} from "@hooks/useTableColumns";
import { usePlans } from "@services/query/usePlansQuery";
import {
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
} from "@services/mutation/usePlansMutation";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const Plans = () => {
  const { data: plans = [], isLoading } = usePlans();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreatePlan({ onSuccess: closeModal });
  const updateMutation = useUpdatePlan({ onSuccess: closeModal });
  const deleteMutation = useDeletePlan();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      reconnection_fee: 0,
      install_fee: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    form.setFieldsValue({ ...plan, is_active: Boolean(plan.is_active) });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      const body = { ...values, is_active: Boolean(values.is_active) };
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate({ body: values });
    }
  };

  // Reactivate a deactivated plan (no separate endpoint — PATCH is_active=true).
  const activatePlan = (plan) =>
    updateMutation.mutate({ id: plan.id, body: { is_active: true } });

  // Status dropdown filter with human labels (avoids heDecode on numeric 1/0).
  const statusFilters = useDataBasedFilters(plans, "is_active", {
    valueMapping: { 1: "Active", 0: "Inactive" },
  });

  const columns = [
    createColumn({ title: "Name", key: "name", ...renderInputSearch("name") }),
    createColumn({
      title: "Speed",
      key: "down_mbps",
      isSearch: false,
      isSort: false,
      render: (_, r) => `${r.down_mbps} / ${r.up_mbps} Mbps`,
    }),
    createColumn({
      title: "Monthly",
      key: "monthly_price",
      isSearch: false,
      sortType: COLUMN_SORTER_TYPES.NUMBER,
      render: (v) => peso.format(Number(v)),
    }),
    createColumn({
      title: "Reconnect fee",
      key: "reconnection_fee",
      isSearch: false,
      isSort: false,
      render: (v) => peso.format(Number(v)),
    }),
    createColumn({
      title: "Status",
      key: "is_active",
      isSearch: false,
      ...statusFilters,
      render: (active) =>
        active ? (
          <Tag color="green">Active</Tag>
        ) : (
          <Tag color="default">Inactive</Tag>
        ),
    }),
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, plan) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(plan)}
          >
            Edit
          </Button>
          {plan.is_active ? (
            <Popconfirm
              title="Deactivate this plan?"
              description="It stays in history but can't be assigned to new subscriptions."
              okText="Deactivate"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate({ id: plan.id })}
            >
              <Button size="small" type="text" danger icon={<StopOutlined />}>
                Deactivate
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reactivate this plan?"
              description="It can be assigned to new subscriptions again."
              okText="Activate"
              onConfirm={() => activatePlan(plan)}
            >
              <Button
                size="small"
                type="text"
                icon={<CheckCircleOutlined />}
                className="!text-green-600"
              >
                Activate
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-jet">Service Plans</h1>
          <p className="text-graphite mt-1">Speed tiers and monthly pricing.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Plan
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={plans}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit Plan" : "New Plan"}
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
            label="Plan name"
            name="name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. Fiber 50Mbps" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Download (Mbps)"
              name="down_mbps"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} className="w-full" />
            </Form.Item>
            <Form.Item
              label="Upload (Mbps)"
              name="up_mbps"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </div>

          <Form.Item
            label="Monthly price"
            name="monthly_price"
            rules={[{ required: true, message: "Required" }]}
          >
            <InputNumber min={0} precision={2} prefix="₱" className="w-full" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="Reconnection fee" name="reconnection_fee">
              <InputNumber
                min={0}
                precision={2}
                prefix="₱"
                className="w-full"
              />
            </Form.Item>
            <Form.Item label="Installation fee" name="install_fee">
              <InputNumber
                min={0}
                precision={2}
                prefix="₱"
                className="w-full"
              />
            </Form.Item>
          </div>

          {editing && (
            <Form.Item label="Active" name="is_active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Plans;
