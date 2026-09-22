import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/noto-sans-kr";
import "./styles.css";
import { HubProvider } from "./store";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HubProvider>
      <App />
    </HubProvider>
  </React.StrictMode>,
);
