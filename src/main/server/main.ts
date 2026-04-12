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

import { ChildProcess, spawn, spawnSync } from 'child_process';
import { app, dialog } from 'electron';
import { get } from 'http';
import path from 'path';
import kill from 'tree-kill';
import {
  checkJavaVersions,
  getAvailablePort,
  getJavaDBPath,
  getJavaLogPath,
  getJavaPath,
  getRendererPath,
  getSetting,
} from '../utils';
import log from '../utils/log';
import { runH2Migration } from '../utils/h2';

class MainServer {
  static _mainServer: MainServer = null;
  public port: number;
  public process: ChildProcess;
  public jarPath: string;
  public pluginPath: string;
  public starterPath: string;
  public status: 'ready' | 'loading' = 'loading';
  public isKilled: boolean = false;
  static getInstance() {
    if (!MainServer._mainServer) {
      MainServer._mainServer = new MainServer();
    }
    return MainServer._mainServer;
  }

  /**
   * 统一获取各种路径
   */
  private getPaths() {
    const isDev = process.env.NODE_ENV === 'development';
    const basePath = isDev ? process.cwd() : process.resourcesPath || '';

    // 获取JAR路径
    let odcJarPath: string;
    if (process.env.ODC_SERVER_JAR_PATH) {
      odcJarPath = process.env.ODC_SERVER_JAR_PATH;
    } else {
      odcJarPath = path.join(basePath, 'libraries', 'java', 'odc.jar');
    }
    this.jarPath = odcJarPath;

    // 获取插件路径
    let pluginPath: string;
    if (process.env.ODC_SERVER_PLUGINS_PATH) {
      pluginPath = process.env.ODC_SERVER_PLUGINS_PATH;
    } else {
      pluginPath = path.join(basePath, 'libraries', 'java', 'plugins');
    }
    this.pluginPath = pluginPath;

    // 获取启动器路径
    let starterPath: string;
    if (process.env.ODC_SERVER_STARTERS_PATH) {
      starterPath = process.env.ODC_SERVER_STARTERS_PATH;
    } else {
      starterPath = path.join(basePath, 'libraries', 'java', 'starters');
    }
    this.starterPath = starterPath;

    // 获取OBClient路径
    let obClientPath: string;
    switch (process.platform) {
      case 'linux':
      case 'darwin': {
        obClientPath = path.join(basePath, 'libraries', 'obclient/bin/obclient');
        break;
      }
      default: {
        obClientPath = path.join(basePath, 'libraries', 'obclient', 'obclient.exe');
        break;
      }
    }
    const psqlPath = path.join(basePath, 'libraries', 'psql', 'psql.exe');

    // 获取其他库路径
    const othersPath = path.join(basePath, 'libraries', 'others');

    log.info('resourcesPath: ', process.resourcesPath);
    log.info('obPath: ', obClientPath);
    log.info('psqlPath: ', psqlPath);
    log.info('others Path: ', othersPath);
    log.info('jarPath: ', odcJarPath);
    log.info('pluginPath: ', pluginPath);
    log.info('starterPath: ', starterPath);

    return {
      jarPath: odcJarPath,
      pluginPath,
      starterPath,
      obClientPath,
      psqlPath,
      othersPath,
    };
  }

  /**
   * 获取可用的端口
   */
  private async getAvailablePort() {
    try {
      const port = await getAvailablePort();
      this.port = port;
    } catch (e) {
      log.error('getAvailablePort Failed:', e);
      process.exit(1);
    }
  }

  /**
   * 确认服务是否可用
   */
  private async checkServerIsReady(logError: boolean = false) {
    try {
      await new Promise((resolve, reject) => {
        const res = get(`http://127.0.0.1:${this.port}/api/v1/info`, (resp) => {
          log.info('check server api status: ', resp.statusCode);
          let data = '';
          // A chunk of data has been recieved.
          resp.on('data', (chunk) => {
            data += chunk;
          });
          resp.on('end', () => {
            let result;
            try {
              result = JSON.parse(data);
              resolve(result);
            } catch (e) {
              log.error('parse data error', result);
              reject(e);
            }
          });
        }).on('error', (err) => {
          log.info('check server with resp err');
          logError && log.info(err);
          reject(err);
        });
        res.setTimeout(2000);
      });
      return true;
    } catch (e) {
      log.info('check server with false');
      return false;
    }
  }

  /**
   * 等待服务可用
   */
  private async waitServiceAvailable() {
    let count = 0;
    let now = Date.now();
    const getStatus = async (fn, reject) => {
      count++;
      log.info(`fetch server status count(${count})`);
      const isReady = await this.checkServerIsReady(count > 70);
      if (isReady) {
        log.info(`Server startup time:`, (Date.now() - now) / 1000);
        fn(true);
      } else if (count > 70) {
        // 2分钟超时报错
        reject('timeout');
      } else {
        setTimeout(() => {
          getStatus(fn, reject);
        }, 4000);
      }
    };
    return new Promise((resolve, reject) => {
      getStatus(resolve, reject);
    });
  }

  /**
   * 启动服务
   */
  public async startServer() {
    if (this.status == 'ready') {
      return;
    }
    log.info('checking java version');
    const isJavaValid = await checkJavaVersions();
    if (!isJavaValid) {
      log.info('java version not pass, quit');
      app.quit();
      return;
    }
    await this.getAvailablePort();

    // 统一获取所有路径
    const paths = this.getPaths();

    const dbPath = getJavaDBPath();
    if (!dbPath) {
      log.error('元数据库路径获取失败！');
      dialog.showErrorBox(
        `元数据库路径获取失败！`,
        `请以管理员模式启动（日志目录：${app.getPath('userData')}/logs）`,
      );
      app.quit();
      return;
    }
    let javaChildProcess: ChildProcess;
    let javaLogDir = getJavaLogPath();
    let JAVA_HOME;
    let javaBin = 'java';
    let jspawnhelper;
    const java = getJavaPath();
    if (java) {
      JAVA_HOME = java.JAVA_HOME;
      javaBin = java.javaBin;
      jspawnhelper = java.jspawnhelper;
      log.info('platform:', process.platform);
      if (process.platform === 'darwin') {
        /**
         * mac 需要给加一下执行权限
         */
        log.info('添加 java 执行权限');
        const result = spawnSync('chmod', ['a+x', javaBin]);
        const result2 = spawnSync('chmod', ['a+x', jspawnhelper]);
        log.info('javaBin:', result.error, result.stderr?.toString());
        log.info('jspawnhelper: ', result2.error, result2.stderr?.toString());
      }
    }
    let env = {
      ODC_WEB_STATIC_LOCATION: getRendererPath(),
      DB_PATH: dbPath,
      ODC_PROFILE_MODE: 'clientMode',
      CLASSPATH: process.env.CLASSPATH,
      PATH: process.env.PATH,
      JAVA_HOME: process.env.JAVA_HOME,
      ODC_PLUGIN_DIR: paths.pluginPath,
      ODC_STARTER_DIR: paths.starterPath,
      'server.port': `${this.port}`,
      // obClient 文件上传目录
      'obclient.work.dir': path.join(app.getPath('userData'), 'data'),
      // 任务文件上传参数，后续任务会统一到这个目录下
      'file.storage.dir': path.join(app.getPath('userData'), 'data'),
      'obclient.file.path': paths.obClientPath,
      'psql.file.path': paths.psqlPath,
      'libraries.others.file.path': paths.othersPath,
    };
    if (JAVA_HOME) {
      env['JAVA_HOME'] = JAVA_HOME;
    }
    const h2MigrationSuccess = await runH2Migration();
    if (!h2MigrationSuccess) {
      log.error('H2 migration failed');
      app.quit();
      return;
    }
    // https://stackoverflow.com/questions/10232192/exec-display-stdout-live
    try {
      const setting = getSetting();
      let jvmOptions = [],
        odcOptions = [];
      if (setting) {
        jvmOptions = setting['client.jvm.params'].split('\n');
        const odcProperties = setting['client.start.params'];
        if (odcProperties) {
          odcOptions = odcProperties
            .split('\n')
            .filter((item) => Boolean(item.trim()))
            .map((item) => '--' + item);
          log.info('odc system propeties ', odcOptions, setting['client.start.params']);
        }
      }
      log.info('jvmOptions:', jvmOptions.join(' '));
      javaChildProcess = spawn(
        javaBin,
        [
          `-Dodc.log.directory=${javaLogDir}`,
          `-Dfile.encoding=UTF-8`,
          `-Duser.language=en-US`,
          ...jvmOptions,
          '--add-opens',
          'java.base/jdk.internal.loader=ALL-UNNAMED',
          '--add-opens',
          'java.base/java.net=ALL-UNNAMED',
          '--add-opens',
          'java.base/java.lang=ALL-UNNAMED',
          '-jar',
          this.jarPath,
          ...odcOptions,
        ],
        {
          // 一定要设置，默认值为 '/'，会影响到后端日志文件的存放路径
          // https://electronjs.org/docs/all#appgetpathname
          cwd: app.getPath('userData'),
          env,
        },
      );
    } catch (e) {
      log.error('spawn java process error: ', e);
      /**
       * 非自身kill，需要报错，并且退出
       */
      log.error('Java 进程启动失败!');
      dialog.showErrorBox(e.toString(), `请尝试重新启动（日志目录：${javaLogDir})`);
      this.isKilled = true;
      app.quit();
      return;
    }
    log.info(`
    system env
    ${Object.keys(process.env).join('\n')}
    `);
    log.info(`
      runJavaProcess
      jar: ${this.jarPath}
      cwd: ${app.getPath('userData')}
      env: ${JSON.stringify(env, null, 4)}
    `);
    // if (process.env.NODE_ENV === 'development') {
    javaChildProcess.stdout.on('data', (data) => {
      // tslint:disable-next-line:no-console
      console.log('stdout: ' + data.toString());
    });

    javaChildProcess.stderr.on('data', (data) => {
      // tslint:disable-next-line:no-console
      console.log('stderr: ' + data.toString());
    });
    javaChildProcess.on('exit', (code, signal) => {
      // tslint:disable-next-line:no-console
      log.info('Java process exited with code ' + code + ', signal ' + signal);
      if (!this.isKilled) {
        // Forced kill by stopServer() sets isKilled before exit event fires
        // If isKilled is still false, this is an unexpected crash
        log.error('Java 进程异常退出!');
        dialog.showErrorBox(`Java 进程异常退出`, `请尝试重新启动（日志目录：${javaLogDir})`);
        this.isKilled = true;
        app.quit();
      }
    });

    this.process = javaChildProcess;
    try {
      // 进程启动之后再打开浏览器
      await this.waitServiceAvailable();
    } catch (e) {
      // 启动失败
      log.error('Run Server Failed: ', e);
      this.isKilled = true;
      dialog.showErrorBox(`Java 进程启动失败`, `请尝试重新启动（日志目录：${javaLogDir})`);
      app.quit();
      return;
    }
    log.info(`Main Server Start Success(port=${this.port}, path=${this.jarPath})!!!!!`);
    this.status = 'ready';
  }

  /**
   * Get the appropriate signal for terminating the Java process
   * - Linux/macOS: SIGTERM (graceful shutdown)
   * - Windows: Use taskkill or SIGKILL (force kill)
   * Note: tree-kill library handles cross-platform process tree killing
   */
  private getKillSignal(force: boolean): string | null {
    if (process.platform === 'win32') {
      // On Windows, tree-kill doesn't use POSIX signals
      // The library handles Windows process termination internally
      return null;
    }
    // On Unix-like systems, use SIGTERM for graceful, SIGKILL for force
    return force ? 'SIGKILL' : 'SIGTERM';
  }

  public async stopServer(force?: boolean): Promise<boolean> {
    if (!this.process) {
      log.warn('[StopServer] No process to stop');
      this.isKilled = true;
      return true;
    }

    const pid = this.process.pid;
    log.info(`[StopServer] Stopping Java process (pid=${pid}, force=${force})`);

    return new Promise((resolve) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        log.error(`[StopServer] Timeout waiting for process ${pid} to exit`);
        this.isKilled = true;
        resolve(false);
      }, 8000);

      // Clean up timeout if process exits normally
      const cleanup = () => {
        clearTimeout(timeout);
      };

      // Listen for process exit
      const exitHandler = () => {
        cleanup();
        log.info(`[StopServer] Java process ${pid} exited successfully`);
        this.isKilled = true;
        resolve(true);
      };

      // Add exit listener if not already present
      if (this.process.listenerCount('exit') === 0) {
        this.process.once('exit', exitHandler);
      } else {
        // If there's already a listener, use a one-time handler
        this.process.on('exit', exitHandler);
      }

      // Mark as killed BEFORE sending signal to prevent exit handler from showing error dialog
      this.isKilled = true;

      // Kill the process tree
      if (process.platform === 'win32') {
        // Windows: tree-kill handles Windows process killing
        kill(pid, (error) => {
          cleanup();
          if (error) {
            // Process might already be dead
            if ((error as any).code === 'ESRCH') {
              log.info(`[StopServer] Process ${pid} already terminated`);
              this.isKilled = true;
              resolve(true);
            } else {
              log.error(`[StopServer] Error killing process ${pid}:`, error);
              this.isKilled = true;
              resolve(false);
            }
          } else {
            log.info(`[StopServer] Kill signal sent to process ${pid}`);
            // Don't resolve here, wait for exit event
          }
        });
      } else {
        // Unix-like systems: use signal
        const signal = this.getKillSignal(!!force);
        if (signal) {
          kill(pid, signal, (error) => {
            cleanup();
            if (error) {
              // Process might already be dead
              if ((error as any).code === 'ESRCH') {
                log.info(`[StopServer] Process ${pid} already terminated`);
                this.isKilled = true;
                resolve(true);
              } else {
                log.error(`[StopServer] Error killing process ${pid}:`, error);
                this.isKilled = true;
                resolve(false);
              }
            } else {
              log.info(`[StopServer] Sent ${signal} to process ${pid}`);
              // Don't resolve here, wait for exit event
            }
          });
        } else {
          cleanup();
          resolve(false);
        }
      }

      // If forcing, give more time for cleanup
      if (force) {
        // Already handled by timeout above
      }
    });
  }
}

export default MainServer;
