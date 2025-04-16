export default {
  log(...args: unknown[]) {
    console.log(...args);
  },

  info(...args: unknown[]) {
    console.info(...args);
  },

  warn(...args: unknown[]) {
    console.warn(...args);
  },

  error(...args: unknown[]) {
    if (args.every((a) => a instanceof Error)) {
      console.error(...args.map((a) => a.toString()));
    } else {
      console.error(...args);
    }
  },
};
