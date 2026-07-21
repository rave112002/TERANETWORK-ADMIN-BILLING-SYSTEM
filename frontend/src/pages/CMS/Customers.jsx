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
import {
  PlusOutlined,
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import useTableColumns, { useDataBasedFilters } from "@hooks/useTableColumns";
import { useCustomers } from "@services/query/useCustomersQuery";
import {
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "@services/mutation/useCustomersMutation";

// Remove empty/undefined values so we don't send blank strings to the API.
const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  );

const Customers = () => {
  const { data: customers = [], isLoading } = useCustomers();
  const { createColumn, renderInputSearch } = useTableColumns();
  const [form] = Form.useForm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const createMutation = useCreateCustomer({ onSuccess: closeModal });
  const updateMutation = useUpdateCustomer({ onSuccess: closeModal });
  const deleteMutation = useDeleteCustomer();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    form.setFieldsValue(customer);
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

  // Dropdown filter for status, built from the data.
  const statusFilters = useDataBasedFilters(customers, "status");

  const columns = [
    createColumn({
      title: "Account #",
      key: "account_no",
      ...renderInputSearch("account_no", true),
    }),
    createColumn({ title: "Name", key: "name", ...renderInputSearch("name") }),
    createColumn({
      title: "Email",
      key: "email",
      ...renderInputSearch("email", true),
    }),
    createColumn({ title: "Phone", key: "phone", isSort: false }),
    createColumn({
      title: "Status",
      key: "status",
      isSearch: false,
      ...statusFilters,
      render: (v) => (
        <Tag color={v === "active" ? "green" : "default"}>
          {v === "active" ? "Active" : "Inactive"}
        </Tag>
      ),
    }),
    {
      title: "Actions",
      key: "actions",
      align: "right",
      render: (_, c) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(c)}
          >
            Edit
          </Button>
          {c.status === "active" ? (
            <Popconfirm
              title="Deactivate this customer?"
              description="Their billing history is kept; they just become inactive."
              okText="Deactivate"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate({ id: c.id })}
            >
              <Button size="small" type="text" danger icon={<StopOutlined />}>
                Deactivate
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reactivate this customer?"
              description="They become active again."
              okText="Activate"
              onConfirm={() =>
                updateMutation.mutate({ id: c.id, body: { status: "active" } })
              }
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
          <h1 className="text-2xl font-semibold text-jet">Customers</h1>
          <p className="text-graphite mt-1">Subscriber accounts.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Customer
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={customers}
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: "max-content" }}
        className="bg-white rounded-xl border border-platinum"
      />

      <Modal
        title={editing ? "Edit Customer" : "New Customer"}
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
            label="Full name"
            name="name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. Neil Ramos" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
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
            <Form.Item label="Address" name="address">
              <Input placeholder="Street, Barangay, City" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="GPS latitude" name="gps_lat">
              <InputNumber
                min={-90}
                max={90}
                step={0.0001}
                className="w-full"
                placeholder="14.5995"
              />
            </Form.Item>
            <Form.Item label="GPS longitude" name="gps_lng">
              <InputNumber
                min={-180}
                max={180}
                step={0.0001}
                className="w-full"
                placeholder="120.9842"
              />
            </Form.Item>
          </div>

          {editing && (
            <Form.Item label="Status" name="status">
              <Select
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
