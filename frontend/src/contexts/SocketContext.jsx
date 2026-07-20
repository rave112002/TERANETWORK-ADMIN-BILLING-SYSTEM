import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import socket from "../config/socket";
import { useRealtimeStore, useAuthStore, useAlertStore } from "../store";

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [connectionError, setConnectionError] = useState(null);
  const reconnectAttempts = useRef(0);

  const { token, isAuthenticated } = useAuthStore();
  const {
    setTanks,
    setVfds,
    setSensors,
    setChlorinators,
    setRelays,
    updateTank,
    updateVfd,
    updateSensor,
    updateChlorinator,
    updateRelay,
    setConnectionStatus,
    setLastUpdate,
  } = useRealtimeStore();
  const { addAlert } = useAlertStore();

  // Handle socket connection with auth
  const connect = useCallback(() => {
    if (socket.connected) return;

    // Set auth token before connecting
    if (token) {
      socket.auth = { token };
    }

    socket.connect();
  }, [token]);

  // Handle socket disconnection
  const disconnect = useCallback(() => {
    socket.disconnect();
  }, []);

  // Join a specific room for location-based updates
  const joinRoom = useCallback((room) => {
    if (socket.connected) {
      socket.emit("join:room", room);
    }
  }, []);

  // Leave a room
  const leaveRoom = useCallback((room) => {
    if (socket.connected) {
      socket.emit("leave:room", room);
    }
  }, []);

  // Subscribe to specific sensor updates
  const subscribeSensor = useCallback((sensorId) => {
    if (socket.connected) {
      socket.emit("subscribe:sensor", sensorId);
    }
  }, []);

  // Unsubscribe from sensor updates
  const unsubscribeSensor = useCallback((sensorId) => {
    if (socket.connected) {
      socket.emit("unsubscribe:sensor", sensorId);
    }
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
      setConnectionStatus("connected");
      reconnectAttempts.current = 0;

      // Request initial data after connection
      socket.emit("request:initial-data");
    };

    const onDisconnect = (reason) => {
      setIsConnected(false);
      setConnectionStatus("disconnected");

      if (reason === "io server disconnect") {
        // Server initiated disconnect, attempt reconnect
        socket.connect();
      }
    };

    const onConnectError = (error) => {
      setConnectionError(error.message);
      setConnectionStatus("error");
      reconnectAttempts.current += 1;
    };

    const onReconnectAttempt = (attempt) => {
      setConnectionStatus("reconnecting");
      reconnectAttempts.current = attempt;
    };

    // Real-time data handlers
    const onInitialData = (data) => {
      if (data.tanks) setTanks(data.tanks);
      if (data.vfds) setVfds(data.vfds);
      if (data.sensors) setSensors(data.sensors);
      if (data.chlorinators) setChlorinators(data.chlorinators);
      if (data.relays) setRelays(data.relays);
      setLastUpdate(new Date().toISOString());
    };

    const onTankUpdate = (data) => {
      if (Array.isArray(data)) {
        setTanks(data);
      } else {
        updateTank(data.id, data);
      }
      setLastUpdate(new Date().toISOString());
    };

    const onVfdUpdate = (data) => {
      if (Array.isArray(data)) {
        setVfds(data);
      } else {
        updateVfd(data.id, data);
      }
      setLastUpdate(new Date().toISOString());
    };

    const onSensorUpdate = (data) => {
      if (Array.isArray(data)) {
        setSensors(data);
      } else {
        updateSensor(data.id, data);
      }
      setLastUpdate(new Date().toISOString());
    };

    const onChlorinatorUpdate = (data) => {
      if (Array.isArray(data)) {
        setChlorinators(data);
      } else {
        updateChlorinator(data.id, data);
      }
      setLastUpdate(new Date().toISOString());
    };

    const onRelayUpdate = (data) => {
      if (Array.isArray(data)) {
        setRelays(data);
      } else {
        updateRelay(data.id, data);
      }
      setLastUpdate(new Date().toISOString());
    };

    const onAlert = (alert) => {
      addAlert({
        id: alert.id || Date.now(),
        type: alert.type || "warning",
        message: alert.message,
        sensorId: alert.sensor_id,
        locationId: alert.location_id,
        timestamp: alert.timestamp || new Date().toISOString(),
        acknowledged: false,
      });
    };

    // Register event listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    // Data event listeners
    socket.on("initial-data", onInitialData);
    socket.on("tank:update", onTankUpdate);
    socket.on("tanks:update", onTankUpdate);
    socket.on("vfd:update", onVfdUpdate);
    socket.on("vfds:update", onVfdUpdate);
    socket.on("sensor:update", onSensorUpdate);
    socket.on("sensors:update", onSensorUpdate);
    socket.on("chlorinator:update", onChlorinatorUpdate);
    socket.on("chlorinators:update", onChlorinatorUpdate);
    socket.on("relay:update", onRelayUpdate);
    socket.on("relays:update", onRelayUpdate);
    socket.on("alert", onAlert);
    socket.on("alert:new", onAlert);

    // Auto-connect when authenticated
    if (isAuthenticated && token) {
      connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("initial-data", onInitialData);
      socket.off("tank:update", onTankUpdate);
      socket.off("tanks:update", onTankUpdate);
      socket.off("vfd:update", onVfdUpdate);
      socket.off("vfds:update", onVfdUpdate);
      socket.off("sensor:update", onSensorUpdate);
      socket.off("sensors:update", onSensorUpdate);
      socket.off("chlorinator:update", onChlorinatorUpdate);
      socket.off("chlorinators:update", onChlorinatorUpdate);
      socket.off("relay:update", onRelayUpdate);
      socket.off("relays:update", onRelayUpdate);
      socket.off("alert", onAlert);
      socket.off("alert:new", onAlert);
    };
  }, [
    isAuthenticated,
    token,
    connect,
    setTanks,
    setVfds,
    setSensors,
    setChlorinators,
    setRelays,
    updateTank,
    updateVfd,
    updateSensor,
    updateChlorinator,
    updateRelay,
    setConnectionStatus,
    setLastUpdate,
    addAlert,
  ]);

  const emit = useCallback((event, data) => {
    if (socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn("Socket is not connected, cannot emit:", event);
    }
  }, []);

  const on = useCallback((event, callback) => {
    socket.on(event, callback);
  }, []);

  const off = useCallback((event, callback) => {
    socket.off(event, callback);
  }, []);

  const value = {
    socket,
    isConnected,
    connectionError,
    reconnectAttempts: reconnectAttempts.current,
    connect,
    disconnect,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
    subscribeSensor,
    unsubscribeSensor,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

export default SocketContext;
