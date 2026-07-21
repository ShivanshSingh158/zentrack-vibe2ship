import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { View, StyleSheet } from "react-native";

interface PortalContextType {
  mount: (node: ReactNode, key: string) => void;
  unmount: (key: string) => void;
}

const PortalContext = createContext<PortalContextType | null>(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [portals, setPortals] = useState<Record<string, ReactNode>>({});

  const mount = useCallback((node: ReactNode, key: string) => {
    setPortals(prev => ({ ...prev, [key]: node }));
  }, []);

  const unmount = useCallback((key: string) => {
    setPortals(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <PortalContext.Provider value={{ mount, unmount }}>
      {children}
      {Object.entries(portals).map(([key, node]) => (
        <View key={key} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessible={false}>
          {node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

export function Portal({ children, name }: { children: ReactNode; name: string }) {
  const { mount, unmount } = usePortal();

  React.useEffect(() => {
    mount(children, name);
    return () => unmount(name);
  }, [children, name, mount, unmount]);

  return null;
}
