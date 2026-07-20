import { useEffect } from "react";
import { useSocket } from "../contexts/SocketContext";

/**
 * Custom hook to listen to socket events
 * @param {string} event - The event name to listen to
 * @param {function} callback - The callback function to execute when event is received
 */
export const useSocketEvent = (event, callback) => {
  const { on, off } = useSocket();

  useEffect(() => {
    on(event, callback);

    return () => {
      off(event, callback);
    };
  }, [event, callback, on, off]);
};

export default useSocketEvent;
