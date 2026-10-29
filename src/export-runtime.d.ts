declare module 'markmap-export-runtime' {
  const runtime: string;
  export default runtime;
}

declare module 'markmap-export-style' {
  /** 公式和代码样式；字体资源内嵌为 data URL。 */
  const style: string;
  export default style;
}
