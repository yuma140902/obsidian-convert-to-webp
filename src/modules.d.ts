declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}

declare module "wasm-feature-detect" {
  export function simd(): Promise<boolean>;
}
