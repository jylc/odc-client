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

import * as monaco from 'monaco-editor';
import Plugin from '@oceanbase-odc/monaco-plugin-ob';

let plugin = null;
const languages = [];

/**
 * Wrap monaco.languages.registerCompletionItemProvider so that any completion
 * provider registered afterwards (i.e. the OB language plugin's provider)
 * returns suggestions whose inserted text is lowercased on accept.
 *
 * Only the insertText is lowercased; the label/documentation stay unchanged so
 * the suggestion popup still shows the original (uppercase) metadata, while the
 * text actually written into the editor is lowercase.
 */
function patchCompletionProviderToLowerCase() {
  if ((monaco.languages as any).__lowerCasePatched) {
    return;
  }
  (monaco.languages as any).__lowerCasePatched = true;
  const originRegister = monaco.languages.registerCompletionItemProvider.bind(monaco.languages);
  monaco.languages.registerCompletionItemProvider = (languageId: string, provider: any) => {
    const wrapped: any = { ...provider };
    if (typeof provider.provideCompletionItems === 'function') {
      wrapped.provideCompletionItems = async (...args: any[]) => {
        const result = await provider.provideCompletionItems(...args);
        const lowerCaseItem = (item: any) => {
          if (item && typeof item.insertText === 'string') {
            return { ...item, insertText: item.insertText.toLowerCase() };
          }
          return item;
        };
        if (!result) {
          return result;
        }
        if (Array.isArray(result)) {
          return result.map(lowerCaseItem);
        }
        if (result.suggestions) {
          return { ...result, suggestions: result.suggestions.map(lowerCaseItem) };
        }
        return result;
      };
    }
    return originRegister(languageId, wrapped);
  };
}

export function register(language: string): Plugin {
  //@ts-ignore
  window.obMonaco = {
    getWorkerUrl(type) {
      type = type === 'oracle' ? 'oboracle' : type;
      const url = new URL(window.publicPath || '/', location.origin);
      if (process.env.NODE_ENV === 'development') {
        const url = new URL(window.publicPath || '/', location.origin);
        const objectURL = URL.createObjectURL(
          new Blob(
            [
              `importScripts(${JSON.stringify(
                `${url.href}workers/${MONACO_VERSION}/${type}.js`.toString(),
              )});`,
            ],
            {
              type: 'application/javascript',
            },
          ),
        );
        return objectURL;
      }
      return `${url}workers/${MONACO_VERSION}/${type}.js`;
    },
  };
  language = language || 'obmysql';
  // Patch must run before plugin.setup(), since setup() registers the
  // completion provider internally and we want our wrapper to take effect.
  patchCompletionProviderToLowerCase();
  if (plugin) {
    if (language && !languages.includes(language)) {
      languages.push(language);
      plugin.setup([language]);
    }
    return plugin;
  }
  plugin = new Plugin();
  plugin.setup([language]);
  languages.push(language);
  return plugin;
}
