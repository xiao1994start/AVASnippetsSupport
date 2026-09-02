<p align="center">
  <img src="icon.png" alt="AVA Snippets Support" width="128" height="128">
  <h1 align="center">AVA Snippets Support</h1>
</p>

<p align="center">
  <strong>VS Code 扩展｜代码片段 + Ren'Py 语言完整支持</strong><br>
  大量实用 Snippets + 深度 Ren'Py 语法高亮 + 智能 Tab 处理器
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.75%2B-blue?style=flat-square&logo=visualstudiocode" alt="VS Code Version">
  <img src="https://img.shields.io/badge/Ren'Py-Support-green?style=flat-square" alt="Ren'Py Support">
  <img src="https://img.shields.io/badge/Snippets-Python%20%7C%20BAT%20%7C%20JS%20%7C%20TS%20%7C%20SCSS-orange?style=flat-square" alt="Snippets">
</p>

## 核心特性

- **Ren'Py 语言深度支持**
  - 文件：`.rpy` `.rpym` `.rpymc` `.rpyc`
  - 语法高亮：完整覆盖 script、screen、style、ATL、嵌入 Python
  - 自动配对 & 智能缩进：括号、引号、三引号、字符串前缀（r"" f"" 等）
  - 折叠：支持 `# region` / `# endregion`
  - 日志高亮：注入式高亮 debug/info/warning/error 日志格式

- **数百个高质量代码片段**  
  Python：requests、pandas、selenium、tkinter、flet、nicegui、reflex、asyncio、PyInstaller、FastAPI、Django 等  
  BAT：7z、curl、git、npm、uiautomation、uv、注册表、进程管理等  
  JS/TS：axios、element-plus、Vue 基础  
  SCSS：按钮样式  
  JSON / Markdown / XML：实用模板  
  Ren'Py：变量、label、menu、screen、style、attr 等

- **智能 Tab 行为（可开关）**
  - 括号/引号内跳出
  - 括号对内跳入
  - 跳过 : ; ( { [ 等符号
  - 多光标 / 多行缩进 / 减少缩进智能处理
  - 行尾 / 空行 / 跨行分隔符特殊逻辑
  - 搜索范围限制 50 行，避免卡顿

## 快速安装

**市场安装**  
在 VS Code 扩展面板搜索：`AVA Snippets Support`

**源码安装**

```bash
git clone https://github.com/xiao1994start/AVASnippetsSupport.git
cd AVASnippetsSupport
npm install
# F5 进入调试模式，或
npx vsce package   # 打包 .vsix 文件手动安装
```

## 设置项（可选）

JSON

```
{
  "avasnippetssupport.enableSmartTab": true   // 默认 true，关闭后使用 VS Code 原生 Tab
}
```

## 使用示例

### Ren'Py

输入前缀 + Tab：

- label → label xxx:
- screen → screen 定义模板
- menu → 完整菜单结构
- style → style xxx: 模板
- transform → ATL transform 模板

### Python

- reqget → requests.get 模板
- pdread → pandas.read_csv
- fletbtn → Flet 按钮控件
- uvbat → uv 虚拟环境常用 bat 命令

### BAT

- 7z → 7-Zip 压缩/解压
- uac → 获取管理员权限模板
- uia → uiautomation 启动模板

### 智能 Tab 演示（文字版）

```text
print("hello|")          → Tab → print("hello")|
func(   |   )            → Tab → func( | )
if cond:|                → Tab → if cond:    （跳到冒号后）
[1, 2, 3|]               → Tab → [1, 2, 3]|
```



开发者：AVA (@xiao1994start)
