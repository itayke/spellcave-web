// UI bridge — the object installed as `cave.ui`, replacing the engine's internal NULL_UI proxy.
//
// The engine notifies its view by calling into `this.ui` (e.g. `this.ui.digStateScreen
// .updateTypedWord(...)`, `this.ui.setUIState('DIG')`, `this.ui.startMove(...)`). Those deep,
// imperative calls are genuinely view concerns — the real CaveUI screens/buttons land in Phase 4.
// What Phase 3 needs is the *signal*: "the model changed, re-read the snapshot." So this bridge is a
// recursive proxy that absorbs every call/property access (exactly like NULL_UI, so nothing the
// engine does can throw) but fires an `onChange` notification on each invocation.
//
// Notifications are coalesced to one microtask: a single engine flow (a dig, a hint sweep) makes
// many `ui` calls, and we only want one snapshot publish per burst. Synchronous store actions
// publish directly; this bridge covers the async engine→view flows (checkAvailableWords,
// asyncFinalizeDig, …) that settle outside any store action.
export function createUIBridge(onChange) {
  let scheduled = false;
  const notify = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      onChange();
    });
  };

  const proxy = new Proxy(function () {}, {
    // Any property access returns the same proxy, so arbitrarily deep chains
    // (`ui.digStateScreen.digButton.setX`) resolve to a truthy, callable value.
    get: () => proxy,
    // Any call is a "something changed" signal: schedule a publish, return the proxy for chaining.
    apply: () => {
      notify();
      return proxy;
    },
  });

  return proxy;
}
