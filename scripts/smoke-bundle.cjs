const Module = require("node:module");
const path = require("node:path");

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  require(path.join(__dirname, "..", "dist", "extension.js"));
} finally {
  Module._load = originalLoad;
}
