import { message, notification } from "antd";
import { MessageContext, NotifContext } from "@helpers/message-context";
import Routers from "./routes";

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [notificationApi, contextHolderNotif] = notification.useNotification();

  return (
    <>
      {contextHolder}
      {contextHolderNotif}
      <MessageContext.Provider value={messageApi}>
        <NotifContext.Provider value={notificationApi}>
          <Routers />
        </NotifContext.Provider>
      </MessageContext.Provider>
    </>
  );
}

export default App;
