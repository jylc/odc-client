declare module 'monaco-editor-nls' {
  export function setLocaleData(data: any): void;
}

declare module 'monaco-editor-nls/locale/*.json' {
  const content: Record<string, any>;
  export default content;
}
