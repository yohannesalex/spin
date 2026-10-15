// Prisma returns BigInt for wallet balances; JSON cannot encode BigInt natively.
// Values stay far below Number.MAX_SAFE_INTEGER santim, so Number is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};
export {};
