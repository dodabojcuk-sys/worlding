const MAXIMUM_CREDENTIAL_CHARACTERS = 512;

/**
 * Keeps one provider credential behind a server-only backend. The default is
 * process memory for existing unit fixtures; production wiring supplies the
 * persistent Keychain/development backend explicitly.
 */
export function createSessionCredentialController(options = {}) {
  let credential = "";
  const backend = options.backend || null;

  return Object.freeze({
    configured() {
      return backend && typeof backend.configured === "function" ? backend.configured() : credential.length > 0;
    },
    replace(value) {
      if (typeof value !== "string") throw new TypeError("Provider credential must be a string.");
      const next = value.trim();
      if (next.length < 8 || next.length > MAXIMUM_CREDENTIAL_CHARACTERS || /[\r\n\0]/.test(next)) {
        throw new TypeError("Provider credential is invalid.");
      }
      if (backend) backend.write(next);
      else credential = next;
    },
    clear() {
      if (backend) backend.clear();
      else credential = "";
    },
    readForProvider() {
      return backend ? backend.read() : credential;
    },
    backendKind() {
      return backend?.kind || "process-memory";
    }
  });
}
