// Single-package barrel for @sunpath/shared.
// Cross-MODULE barrels are forbidden (design §12.12); this is intra-package only.

export * from "./scoring.js";
export * from "./adapters.js";
export * from "./permit-adapters.js";
export * from "./schemas/index.js";
export * from "./bill-parser.js";
export * from "./bill-redactor.js";
export * from "./doorcard.js";
