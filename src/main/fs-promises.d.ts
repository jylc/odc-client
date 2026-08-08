/**
 * 本地类型声明：补齐老版本 @types/node（v9）缺失的 `fs/promises` 模块类型。
 *
 * 项目当前依赖的 @types/node 版本较老，不含 Node.js 10+ 引入的 `fs/promises`
 * 子路径类型声明，导致 tsc 报 `TS2307: Cannot find module 'fs/promises'`。
 * 运行时（electron 内置的 node）支持该模块，这里仅补充类型声明让编译通过。
 *
 * 仅声明 src/main/utils/h2.ts 实际用到的方法（rm / mkdir / rename）。
 */
declare module 'fs/promises' {
  interface RmOptions {
    recursive?: boolean;
    force?: boolean;
  }
  interface MkdirOptions {
    recursive?: boolean;
    mode?: number;
  }
  export function rm(path: string, options?: RmOptions): Promise<void>;
  export function mkdir(path: string, options?: MkdirOptions | number): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
}
