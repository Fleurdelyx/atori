// jsdom lacks a few browser APIs the stores touch at import time
if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as never;
}

if (!URL.createObjectURL) {
  URL.createObjectURL = (() => "blob:mock") as never;
  URL.revokeObjectURL = (() => {}) as never;
}
