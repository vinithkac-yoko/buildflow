/** A tiny IndexedDB wrapper (no dependency): one database, an outbox store and a key/value store. Every call resolves or rejects; none throws synchronously. */
const DB_NAME = "buildflow-offline";
const VERSION = 1;

export type StoreName = "outbox" | "kv";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available"));
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "clientTxnId" });
        s.createIndex("seq", "seq", { unique: true });
      }
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGetAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>).then((r) => r ?? []);
export const idbGet = <T>(store: StoreName, key: string) => tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
export const idbPut = (store: StoreName, value: unknown, key?: string) => tx(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))).then(() => undefined);
export const idbDelete = (store: StoreName, key: string) => tx(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
export const idbClear = (store: StoreName) => tx(store, "readwrite", (s) => s.clear()).then(() => undefined);
