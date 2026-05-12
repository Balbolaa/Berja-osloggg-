import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "leaflet/dist/leaflet.css";

// Finds the root HTML element, creates the React root, and renders the App component into it.
createRoot(document.getElementById("root")!).render(<App />);
