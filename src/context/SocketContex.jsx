import { createContext, useContext, useMemo } from "react";
import { io } from "socket.io-client";


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const SocketContext = createContext(null);

export function SocketProvider({ children }) {

const socket = useMemo(
    () => io(BACKEND_URL, { withCredentials: true }),
    []
  );

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}