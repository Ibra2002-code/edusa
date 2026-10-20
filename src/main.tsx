import React from "react";
import { hydrateRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./hooks/use-auth";
import "./styles.css";

hydrateRoot(
  document,
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);