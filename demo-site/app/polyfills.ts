const processLike = globalThis.process as any;

if (processLike) {
  processLike.stdout ??= {
    fd: 1,
    isTTY: false,
    write: () => true,
  };
  processLike.stderr ??= {
    fd: 2,
    isTTY: false,
    write: () => true,
  };
  processLike.stdin ??= {
    isTTY: false,
    resume: () => {},
    pause: () => {},
  };
}

export {};
