const vscode = require("vscode");

/**
 * 根据缩进级别和用户设置生成目标缩进字符串。
 * @param {number} level 目标缩进级别 (0, 1, 2, ...)
 * @param {vscode.FormattingOptions} options 用户的格式化设置 (tabSize, insertSpaces)
 * @returns {string} 目标缩进字符串 (例如：'    ', '        ', '\t')
 */
function getTargetIndentation(level, options) {
  if (options.insertSpaces) {
    return " ".repeat(level * options.tabSize);
  } else {
    return "\t".repeat(level);
  }
}

/**
 * 文档格式化提供程序的核心实现。
 * 负责计算并返回修正缩进所需的 TextEdit 数组。
 * @param {vscode.TextDocument} document 当前文档对象
 * @param {vscode.FormattingOptions} options 用户的格式化选项
 * @returns {vscode.TextEdit[]} 文本编辑数组
 */
function provideDocumentFormattingEdits(document, options) {
  const edits = [];
  let currentLevel = 0; // 当前代码块的理论缩进级别

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const lineText = line.text;
    const trimmedText = lineText.trim();

    // 忽略空行或只包含空格的行
    if (trimmedText.length === 0) {
      continue;
    }

    // --- 1. 确定当前行应该应用的缩进级别 (targetLevel) ---
    let targetLevel = currentLevel;

    // 特殊处理：如果行是 'elif' 或 'else'，它们应该在上一级的缩进上
    // 这意味着它先退出一个块，再进入一个块，但 foramtter 应该将其校正到上一级。
    if (trimmedText.match(/^(elif|else)\b/)) {
      // 将目标级别设置为当前级别减 1，但最小为 0
      targetLevel = Math.max(0, currentLevel - 1);
    }

    // --- 2. 检查并修正缩进 ---

    const targetIndentation = getTargetIndentation(targetLevel, options);
    // 获取当前行的实际缩进范围
    const currentIndentationEndIndex = line.firstNonWhitespaceCharacterIndex;
    const currentIndentation = lineText.substring(
      0,
      currentIndentationEndIndex
    );

    if (currentIndentation !== targetIndentation) {
      // 发现不匹配，创建替换当前缩进的 TextEdit
      const rangeToReplace = new vscode.Range(
        i,
        0,
        i,
        currentIndentationEndIndex
      );
      edits.push(vscode.TextEdit.replace(rangeToReplace, targetIndentation));
    }

    // --- 3. 更新下一行的理论缩进级别 (currentLevel) ---

    // 如果是块开始关键字（以冒号结尾，且不是 elif/else），则下一级的级别加 1
    // 匹配：label:, menu:, if:, while:, python:, define:, screen: 等
    if (
      trimmedText.match(
        /^(label|menu|screen|if|while|for|python|define)\b.*:$/
      ) &&
      !trimmedText.match(/^(elif|else)\b/)
    ) {
      currentLevel += 1;
    }
    // 如果是 elif/else，则下一行保持当前级别
    else if (trimmedText.match(/^(elif|else)\b.*:$/)) {
      // 级别在 targetLevel (currentLevel - 1) 基础上加 1，即回到 currentLevel
      // 由于前面 targetLevel 已经减 1，这里不需要再减
    }
    // 如果是零级关键字 (如 label, screen)，并且不以冒号结尾，则后续代码块的缩进级别重置为 0
    else if (
      trimmedText.match(/^(label|screen|init|define)\b/) &&
      !trimmedText.endsWith(":")
    ) {
      // 这是 Ren'Py 的特殊情况：零级关键字后，后续代码应在零级 (除非后面有冒号)
      currentLevel = 0;
    }
  }

  return edits;
}

/**
 * 插件激活函数 (由 VS Code 调用)
 * @param {vscode.ExtensionContext} context 插件的上下文对象
 */
function activate(context) {
  console.log("Ren'Py Formatting Extension is now active.");

  // 注册文档格式化提供程序
  const disposableFormatter =
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "renpy" }, // 关联到您的语言 ID
      {
        provideDocumentFormattingEdits, // 使用上面定义的格式化函数
      }
    );

  // 将注册的提供程序添加到订阅列表，以便在插件停用时清理
  context.subscriptions.push(disposableFormatter);
}
exports.activate = activate;

/**
 * 插件停用函数 (由 VS Code 调用)
 */
function deactivate() {}
exports.deactivate = deactivate;
