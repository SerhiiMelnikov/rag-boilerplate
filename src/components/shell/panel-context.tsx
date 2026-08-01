"use client";

import { createContext, useContext, useState } from "react";

// The drawer's trigger lives in the mobile header and the drawer itself lives in
// the panel; they are siblings under the layout, so the open state is context
// rather than props threaded through everything in between.
const PanelContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <PanelContext.Provider value={{ open, setOpen }}>{children}</PanelContext.Provider>;
}

export function usePanel(): { open: boolean; setOpen: (open: boolean) => void } {
  const value = useContext(PanelContext);
  if (!value) throw new Error("usePanel must be used inside a PanelProvider");
  return value;
}
