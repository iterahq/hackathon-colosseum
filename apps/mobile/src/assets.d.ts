// A bundled image, as Metro resolves it: an asset id, which `Image` takes as its `source`.
declare module '*.png' {
  const source: number;
  export default source;
}
