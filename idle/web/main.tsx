import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./hud.css";
import "./experience.css";
import "./chat.css";
import "./classic-layout.css";
import "./classic-status.css";
import "./fullscreen.css";
import "./scene-polish-hud.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
