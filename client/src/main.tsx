import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}

createRoot(document.getElementById("root")!).render(<App />);
