export const Directory = { Data: "DATA" };

const files = globalThis.__wildexFilesystemStubFiles ??= new Map();
const Binary = (bytes) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

export const seedPhotoFile = (path, bytes) => { files.set(path, Uint8Array.from(bytes)); };
export const removePhotoFile = (path) => { files.delete(path); };

export const Filesystem = {
  stat: async ({ path }) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error("not_found");
    return { size: bytes.byteLength };
  },
  readFile: async ({ path }) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error("not_found");
    return { data: Binary(bytes) };
  },
  getUri: async ({ path }) => {
    if (!files.has(path)) throw new Error("not_found");
    return { uri: `file:///data/user/0/com.mrlabs.wildex/files/${path}` };
  },
  writeFile: async ({ path, data }) => {
    files.set(path, typeof data === "string" ? Uint8Array.from(Buffer.from(data, "base64")) : Uint8Array.from(data));
  },
  mkdir: async () => undefined,
};
