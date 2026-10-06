const store = globalThis.__photoStorageStub ??= { calls: 0, next: () => Promise.resolve(undefined) };
export const state = store;
export const resolveObservationPhoto = async (reference) => {
  store.calls += 1;
  return store.next(reference);
};
