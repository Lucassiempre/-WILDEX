const store = globalThis.__photoSyncStub ??= { calls: 0 };
export const state = store;
export const resolveDiscoveryPhoto = async () => {
  store.calls += 1;
  return undefined;
};
