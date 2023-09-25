
export type RenderOptions = {

  /**
   * Creates already-instantiated versions of Thrift structures which have no variables. This
   * reduces allocations where objects exist purely as a nonce.
   *
   * @default true
   */
  zeroInstance?: boolean;

  /**
   * Where to import a small number of helpers from.
   *
   * @default "thrift-tools"
   */
  toolImport?: string;

  /**
   * Whether to include code to write the Thrift-encoded data (otherwise, this just reads). This
   * code ends up being quite weighty, so only include it if you need to.
   *
   * @default false
   */
  includeWriter?: boolean;

};