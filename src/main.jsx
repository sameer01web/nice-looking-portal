import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// Prevent mouse-wheel / trackpad scrolling from accidentally altering number inputs
if (typeof window !== "undefined") {
  window.addEventListener(
    "wheel",
    (e) => {
      const isNumberInput = (el) => el && el.tagName === "INPUT" && el.type === "number";
      if (isNumberInput(e.target) || isNumberInput(document.activeElement)) {
        if (isNumberInput(e.target)) {
          e.preventDefault();
        }
        if (isNumberInput(document.activeElement)) {
          document.activeElement.blur();
        }
      }
    },
    { capture: true, passive: false }
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);