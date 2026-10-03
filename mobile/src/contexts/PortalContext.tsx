import React, { createContext, useContext, useSyncExternalStore, ReactNode } from "react";
import { View, StyleSheet } from "react-native";

interface PortalContextType {
  mount: (node: ReactNode, key: string) => void;
  unmount: (key: string) => void;
}

const PortalContext = createContext<PortalContextType | null>(null);

type Listener = () => void;

class PortalStore {
  private portals: Map<string, ReactNode> = new Map();
  private listeners: Set<Listener> = new Set();
  private snapshot: Array<[string, ReactNode]> = [];

  constructor() {
    this.updateSnapshot();
  }

  private updateSnapshot() {
    this.snapshot = Array.from(this.portals.entries());
  }

  mount = (node: ReactNode, key: string) => {
    this.portals.set(key, node);
    this.updateSnapshot();
    this.notify();
  };

  unmount = (key: string) => {
    if (this.portals.delete(key)) {
      this.updateSnapshot();
      this.notify();
    }
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify() {
    this.listeners.forEach(fn => fn());
  }
}

const portalStore = new PortalStore();

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}

/**
 * Isolated outlet that subscribes to portal changes.
 * Because state is decoupled into PortalStore, PortalProvider itself
 * never re-renders, protecting the entire root app tree from spurious renders.
 */
function PortalOutlet() {
  const activePortals = useSyncExternalStore(portalStore.subscribe, portalStore.getSnapshot);

  return (
    <>
      {activePortals.map(([key, node]) => (
        <View key={key} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessible={false}>
          {node}
        </View>
      ))}
    </>
  );
}

const portalApi: PortalContextType = {
  mount: portalStore.mount,
  unmount: portalStore.unmount,
};

export function PortalProvider({ children }: { children: ReactNode }) {
  return (
    <PortalContext.Provider value={portalApi}>
      {children}
      <PortalOutlet />
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

