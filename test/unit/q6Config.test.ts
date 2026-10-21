const original = process.env.PREDECESSOR_PERIOD_HANDOFF;
afterEach(() => {
  if (original === undefined) delete process.env.PREDECESSOR_PERIOD_HANDOFF;
  else process.env.PREDECESSOR_PERIOD_HANDOFF = original;
  jest.resetModules();
});
it.each([[undefined, false], ["false", false], ["true", true]])(
  "loads PREDECESSOR_PERIOD_HANDOFF=%s as %s", (value, expected) => {
    if (value === undefined) delete process.env.PREDECESSOR_PERIOD_HANDOFF;
    else process.env.PREDECESSOR_PERIOD_HANDOFF = value;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const { config } = require("../../src/config");
      expect(config.tools.predecessorPeriodHandoff).toBe(expected);
    });
  },
);
