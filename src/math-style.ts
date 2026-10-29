/** WebKit foreignObject 中用原生 MathML 保持公式定位；组件与导出共用。 */
export const NATIVE_MATH_STYLE = `
  .markmap-native-math .katex .katex-html { display: none; }
  .markmap-native-math .katex .katex-mathml {
    position: static; clip: auto; width: auto; height: auto;
    overflow: visible; white-space: normal; display: inline;
  }
`;
