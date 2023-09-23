
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

};