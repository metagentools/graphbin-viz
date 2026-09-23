import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";

// Fluent UI is CSS-in-JS (Griffel), so there is no component stylesheet to
// import here: FluentProvider injects what the rendered components need.
import "./style.css";

createRoot(document.getElementById("root")).render(<App />);
