import { useState } from "react";
import {
  Button,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

import useTableColumns, { useDataBasedFilters } from "@hooks/useTableColumns";
import { useSubscriptions } from "@services/query/useSubscriptionsQuery";
import { useCustomers } from "@services/query/useCustomersQuery";
import { usePlans } from "@services/query/usePlansQuery";
import { useOnus } from "@services/query/useOnusQuery";
import {
  useCreateSubscription,
  useUpdateSubscription,
  useChangeSubscriptionStatus,
} from "@services/mutation/useSubscriptionsMutation";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const STATUS_COLORS = {
  pending: "gold",
  active: "green",
  suspended: "red",
  terminated: "default",
};

const Subscriptions = () => {
  const { data: subs = [], isLoading } = useSubscriptions();
  const { data: customers = [] } = useCustomers();
  const { data: plans = [] } = usePlans();
  const { data: onus = [] } = useOnus();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateSubscription({ onSuccess: closeModal });
  const updateMutation = useUpdateSubscription({ onSuccess: closeModal });
  const statusMutation = useChangeSubscriptionStatus();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ statement_day: 1 });
    setModalOpen(true);
  };

  const openEdit = (sub) => {
    setEditing(sub);
    form.setFieldsValue({
      plan_id: sub.plan_id,
      onu_id: sub.onu_id ?? undefined,
      statement_day: sub.statement_day,
    });
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

  const setStatus = (id, status) => statusMutation.mutate({ id, status });

  // Dropdown options (only active customers/plans are assignable).
  const customerOptions = customers
    .filter((c) => c.status === "active")
    .map((c) => ({ value: c.id, label: `${c.name} (${c.account_no})` }));
  const planOptions = plans
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id,
      label: `${p.name} — ${peso.format(Number(p.monthly_price))}`,
    }));
  const onuOptions = onus.map((o) => ({ value: o.id, label: o.serial_no }));

  const statusFilters = useDataBasedFilters(subs, "status");

  const columns = [
    createColumn({
      title: "Customer",
      key: "customer_name",
      ...renderInputSearch("customer_name"),
      render: (_, r) => (
        <div>
          <div className="text-jet">{r.customer_name}</div>
          <div className="text-ash text-xs">{r.account_no}</div>
        </div>
      ),
    }),
    createColumn({
      title: "Plan",
      key: "plan_name",
      isSearch: false,
      render: (_, r) => (
        <div>
          <div className="text-jet">{r.plan_name}</div>
          <div className="text-ash text-xs">
            {peso.format(Number(r.monthly_price))}/mo
          </div>
        </div>
      ),
    }),
    createColumn({
      title: "ONU",
      key: "onu_serial",
      isSearch: false,
      isSort: false,
      render: (v) => v ?? <span className="text-ash">—</span>,
    }),
    createColumn({
      title: "Statement day",
      key: "statement_day",
      isSearch: false,
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
      render: (_, s) => {
        if (s.status === "terminated") {
          return <span className="text-ash text-xs">Terminated</span>;
        }
        return (
          <Space wrap>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEdit(s)}
            >
              Edit
            </Button>

            {(s.status === "pending" || s.status === "suspended") && (
              <Button
                size="small"
                type="text"
                icon={<PlayCircleOutlined />}
                className="!text-green-600"
                onClick={() => setStatus(s.id, "active")}
              >
                Activate
              </Button>
            )}

            {s.status === "active" && (
              <Button
                size="small"
                type="text"
                icon={<PauseCircleOutlined />}
                className="!text-amber-600"
                onClick={() => setStatus(s.id, "suspended")}
              >
                Suspend
              </Button>
            )}

            <Popconfirm
              title="Terminate this subscription?"
              description="This is permanent and frees the ONU. It can't be reactivated."
              okText="Terminate"
              okButtonProps={{ danger: true }}
              onConfirm={() => setStatus(s.id, "terminated")}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<CloseCircleOutlined />}
              >
                Terminate
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-jet">Subscriptions</h1>
          <p className="text-graphite mt-1">
            Bind a customer to a plan and an ONU, and manage the service
            lifecycle.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Subscription
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={subs}
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit Subscription" : "New Subscription"}
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
          {!editing && (
            <Form.Item
              label="Customer"
              name="customer_id"
              rules={[{ required: true, message: "Select a customer" }]}
            >
              <Select
                options={customerOptions}
                placeholder="Select customer"
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          <Form.Item
            label="Plan"
            name="plan_id"
            rules={[{ required: true, message: "Select a plan" }]}
          >
            <Select
              options={planOptions}
              placeholder="Select plan"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item label="ONU (optional)" name="onu_id">
            <Select
              options={onuOptions}
              placeholder="Assign an ONU"
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            label="Statement day (1–28)"
            name="statement_day"
            rules={[{ required: true, message: "Required" }]}
          >
            <InputNumber min={1} max={28} className="w-full" />
          </Form.Item>

          {!editing && (
            <p className="text-ash text-xs">
              New subscriptions start as <b>pending</b>. Use the row actions to
              activate, suspend, or terminate.
            </p>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Subscriptions;
