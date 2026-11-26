// Money is BIGINT (minor units). JSON has no bigint, so responses carry it as a decimal string:
// { "priceMinor": "4990" }. Clients format it with formatMoney() from @gym/shared.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (!("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function (this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

export {};
