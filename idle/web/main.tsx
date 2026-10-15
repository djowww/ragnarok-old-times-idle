import React from "react";
import { createRoot } from "react-dom/client";
import PortalApp from "./portal/PortalApp";
import "./styles.css";
import "./hud.css";
import "./experience.css";
import "./chat.css";
import "./classic-layout.css";
import "./classic-status.css";
import "./fullscreen.css";
import "./scene-polish-hud.css";
import "./portal/portal.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalApp />
  </React.StrictMode>,
);
