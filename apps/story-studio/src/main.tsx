import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "leaflet/dist/leaflet.css";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";
import "./styles/presentation-r1.css";
import "./styles/product-shell-r0.css";
import "./styles/nuwa-bounded-r0.css";
import "./styles/multiverse-single-derived-r0.css";
import "./styles/story-observation-r0.css";

const root = document.getElementById("root");
if (!root) throw new Error("Story Studio root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
