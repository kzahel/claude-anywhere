import { type ReactNode, createContext, useContext, useState } from "react";

interface ActivityDrawerContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  drawerHeight: number;
}

const DRAWER_CLOSED_HEIGHT = 36;
const DRAWER_OPEN_HEIGHT = 300;

const ActivityDrawerContext = createContext<ActivityDrawerContextValue | null>(
  null,
);

export function ActivityDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const drawerHeight = isOpen ? DRAWER_OPEN_HEIGHT : DRAWER_CLOSED_HEIGHT;

  return (
    <ActivityDrawerContext.Provider value={{ isOpen, setIsOpen, drawerHeight }}>
      {children}
    </ActivityDrawerContext.Provider>
  );
}

export function useActivityDrawer() {
  const context = useContext(ActivityDrawerContext);
  if (!context) {
    throw new Error(
      "useActivityDrawer must be used within ActivityDrawerProvider",
    );
  }
  return context;
}

export { DRAWER_CLOSED_HEIGHT, DRAWER_OPEN_HEIGHT };
