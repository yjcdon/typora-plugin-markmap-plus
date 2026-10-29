# Markmap Plus：AI 安装说明

本说明供拥有本机文件读写能力的 AI 执行。交付为 markmap-plus 文件夹，用户保存文档、退出 Typora，完成安装后重启。支持目标为 Windows 10 和 macOS；实际验证组合见仓库 docs/05-验证记录.md。

## 安装检查

1. 读取 manifest.json，检查 loader.js、app/main.js、app/katex.css、app/highlight.css 和 app/fonts 完整。
2. 读取实际系统、架构和 Typora 版本，定位正在使用的应用。macOS 常见为 /Applications/Typora.app；Windows 依据快捷方式或已安装程序信息定位。
3. 定位页面：macOS 为 Contents/Resources/TypeMark/index.html；Windows 为 resources/window.html。路径与页面结构匹配后再编辑。申请实际需要的目录写入权限。
4. 保存用户文档并退出 Typora。读取页面，记录现有加载入口和插件状态。把本次操作前页面备份到系统临时目录的独立操作文件夹，向用户报告位置。回滚仅使用同一 Typora 版本、本次操作对应的备份。

## 放置文件与入口

插件目录：

- macOS：~/Library/Application Support/abnerworks.Typora/markmap-plus
- Windows：%APPDATA%\Typora\markmap-plus

复制 loader.js、app、manifest.json、INSTALL.md 和许可证；已有 data 目录保留。将下述入口放在页面结束 body 标签之前。已有 MARKMAP_PLUS_START / MARKMAP_PLUS_END 完整标记时替换这一个区域。标记数量或配对异常时，先报告实际差异并精确修复。

```html
<!-- MARKMAP_PLUS_START -->
<script>
(() => {
  const script = document.createElement('script');
  script.src = 'PLUGIN_LOADER_URL';
  script.dataset.markmapPlusEntry = 'true';
  script.onerror = () => script.remove();
  document.head.appendChild(script);
})();
</script>
<!-- MARKMAP_PLUS_END -->
```

AI 将 PLUGIN_LOADER_URL 替换为实际 URL，按 URL 规则编码路径，并按 JavaScript 字符串规则转义。macOS 使用目标 loader.js 的绝对 file URL，例如 file:///Users/example/Library/Application%20Support/abnerworks.Typora/markmap-plus/loader.js。Windows 使用 typora://app/userData/markmap-plus/loader.js，实测宿主协议可读性。loader 加载失败时入口静默结束；安装检查核验实际资源位置与访问条件。

## 旧设置迁移

首次迁移按顺序检查旧框架 settings/data 下 util6.markmapplus.json、typora-community-plugin.markmapplus.json、typora-plugin-markmap-plus.json。macOS 常见框架目录为用户数据目录/plugins；Windows 根据原框架入口和实际链接确定目录。

已确认旧配置结构为 `{ "version": 1, "settings": { ... } }`，将 settings 对象写入独立目录 data/settings.json：

```json
{ "schemaVersion": 1, "values": { "exportDirectory": "/Users/example/Downloads" } }
```

示例路径应替换为原设置中的实际值，其他业务字段原样迁移。独立配置已存在时沿用其内容；缺失字段由程序补齐默认值。旧配置格式异常时保留来源并报告原因。

确认独立配置可解析后，在原框架 settings/plugins.json 中将实际旧 Markmap ID 设为 false，保留其他插件设置。若原框架仅用于 Markmap，可在用户要求移除框架时清理其确切加载标签。验证独立运行时可临时移除框架入口，记录原内容供恢复。

## 完成检查

确认页面仅有一对专属标记，入口 URL 指向完整程序，配置可解析且值正确。先报告文件配置结果；打开 Typora 后确认右下角导图按钮、设置读取保存、正文定位和一次导出。若 macOS 启动校验或宿主接口报错，记录原始原因并恢复本次入口改动，交付兼容问题记录。

## 更新与恢复

退出 Typora，记录当前版本，保留 data。新版本替换 loader.js、app、manifest 和说明；旧构建与替换出的旧程序进入系统废纸篓。核对入口后重启验证。

更新失败时从本次操作记录及废纸篓恢复原程序和对应入口。Typora 升级后以新版页面为基准重新插入标记段，保留新版页面其他内容。重新检查宿主能力并记录兼容结果。

## 停用与卸载

停用：退出 Typora，将 markmap-plus 目录移到废纸篓，重启。

完整卸载：退出 Typora，从当前页面精确移除 MARKMAP_PLUS_START 到 MARKMAP_PLUS_END 区域，将目录与设置移到废纸篓；再次执行时按实际剩余文件清理。其他插件入口保留。报告已清理内容以及本次备份位置。
