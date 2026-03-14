declare module "sql.js" {
  interface InitSqlJsOptions {
    locateFile?: (filename: string) => string;
  }

  function initSqlJs(options?: InitSqlJsOptions): Promise<unknown>;

  export default initSqlJs;
}
