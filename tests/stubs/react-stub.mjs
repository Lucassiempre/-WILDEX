// Minimal React hooks stub for logic-only tests of ObservationImage.
const store = globalThis.__observationImageReactStore ??= {
  hookIndex: 0,
  stateSlots: [],
  refSlots: [],
  effectQueue: [],
};

export function useState(initial) {
  const i = store.hookIndex++;
  if (!(i in store.stateSlots)) store.stateSlots[i] = typeof initial === "function" ? initial() : initial;
  const setState = (value) => {
    store.stateSlots[i] = typeof value === "function" ? value(store.stateSlots[i]) : value;
  };
  return [store.stateSlots[i], setState];
}

export function useEffect(fn) {
  const i = store.hookIndex++;
  store.effectQueue.push({ i, fn });
}

export function useRef(initial) {
  const i = store.hookIndex++;
  if (!(i in store.refSlots)) store.refSlots[i] = { current: initial };
  return store.refSlots[i];
}

export const __state = {
  get src() { return store.stateSlots[0]; },
  effects: () => store.effectQueue,
};

export function __beginRender() {
  store.hookIndex = 0;
  store.effectQueue = [];
}

export function __reset() {
  store.hookIndex = 0;
  store.stateSlots = [];
  store.refSlots = [];
  store.effectQueue = [];
}
