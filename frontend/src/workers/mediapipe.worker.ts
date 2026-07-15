self.addEventListener("message", (event: MessageEvent) => {
  self.postMessage({
    type: "ready",
    payload: event.data,
  });
});

export {};
