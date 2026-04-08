/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import url from 'url';
import MainServer from '../server/main';
import log from '../utils/log';

export class PathnameStore {
  public static PROTOCOL = 'http';
  private static defaultPathname: string = 'index.html';
  private static hostname: string = '127.0.0.1';
  public static pathname: string = PathnameStore.defaultPathname;
  public static hash: string = '';

  // Token 参数存储
  private static pendingToken: string | null = null;
  private static pendingEnv: string | null = null;

  public static getUrl = () => {
    const href = url.format({
      pathname: PathnameStore.pathname,
      hash: PathnameStore.hash,
      protocol: PathnameStore.PROTOCOL,
      slashes: true,
      hostname: PathnameStore.hostname,
      port:
        process.env.NODE_ENV === 'development' ? '8000' : MainServer.getInstance().port.toString(),
    });
    log.info('renderer url: ', href);
    return href;
  };
  public static setPathname = (pathname: string) => {
    PathnameStore.pathname = pathname;
  };
  public static setHash = (hash: string) => {
    PathnameStore.hash = hash;
  };
  public static reset = () => {
    PathnameStore.pathname = PathnameStore.defaultPathname;
    PathnameStore.hash = '';
  };
  public static addParams = (params: string) => {
    PathnameStore.hash = '#/gateway/' + params;
  };

  /**
   * 存储 token 参数
   */
  public static setTokenParams(token: string, env?: string) {
    PathnameStore.pendingToken = token;
    if (env) {
      PathnameStore.pendingEnv = env;
    }
    log.info('Token params stored:', { token: token?.substring(0, 10) + '...', env });
  }

  /**
   * 获取并清除 token 参数
   */
  public static consumeTokenParams(): {
    token: string | null;
    env: string | null;
  } {
    const token = PathnameStore.pendingToken;
    const env = PathnameStore.pendingEnv;
    PathnameStore.pendingToken = null;
    PathnameStore.pendingEnv = null;
    return { token, env };
  }

  /**
   * 检查是否有待处理的 token
   */
  public static hasPendingToken(): boolean {
    return PathnameStore.pendingToken !== null;
  }
}
