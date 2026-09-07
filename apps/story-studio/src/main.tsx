import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./product-shell/theme/tokens.css";
import "./styles/tianyan-r0-shell.css";
import "./styles/project-directory.css";
import "./styles/character-directory.css";
import "./styles/right-dock.css";
import "./styles/tianyi-sidebar.css";
import "./styles/tianyi-workspace.css";
import "./styles/event-line-projection.css";
import "./styles/nuwa-n1.css";
import "./styles/settings.css";
import "@xyflow/react/dist/style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Story Studio root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
