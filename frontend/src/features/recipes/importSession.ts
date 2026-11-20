/**
 * What this browser session learned about the server: set once an import answers 404
 * `import_disabled`, so later forms hide the "Import from a link" area. Not persisted: a new
 * session asks again, in case the administrator turned the feature on.
 */
export const importSession = { disabled: false };
