// Polyfills that load before any other dependencies
import { Buffer } from "buffer";
import process from "process";

// Global reference
const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};

// Make polyfills globally available, but don't overwrite existing implementations
// to avoid breaking host apps that have their own polyfills
if (typeof globalThis !== "undefined") {
  globalThis.Buffer = globalThis.Buffer || Buffer;
  globalThis.process = globalThis.process || process;
  globalThis.global = globalThis.global || globalThis;
}
if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer;
  window.process = window.process || process;
  window.global = window.global || window;
}

export { Buffer, global, process };
