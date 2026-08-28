import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/tianyan-r0-shell.css";

const root = document.getElementById("root");
if (!root) throw new Error("Story Studio root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
