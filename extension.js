// extension.js

const vscode = require("vscode");

// TODO ✅检查光标位置
/**
 * 检查当前活动编辑器中，唯一的或所有光标是否都位于行尾。
 * 此函数仅在 selectedLineCount <= 1 时调用才有意义，但为了稳健性，它检查所有光标。
 *
 * @param {vscode.TextEditor} editor 活动编辑器
 * @param {readonly vscode.Selection[]} selections 选区数组
 * @returns {boolean} 如果所有非空选择或所有单个光标点都在行尾，则返回 true。
 */
function isCursorAtEndOfLine(editor, selections) {
  // 如果没有选中或光标，返回 false
  if (!editor || !selections || selections.length === 0) {
    return false;
  }
  // 检查所有光标/选择
  return selections.every((selection) => {
    // 对于非空选择（即选中了一段文本），我们假设用户意图是操作选中区域，
    // 此时我们主要关注其行为，这里逻辑是假设非空选择不满足“行尾”的判断条件。
    if (!selection.isEmpty) {
      // 如果存在非空选择，通常认为它不满足“光标在行尾”的条件，
      // 除非它正好选中到行尾且是唯一的选择。但为了简化逻辑，
      // 并且既然 selectedLineCount <= 1，我们主要关注光标点。
      return false;
    }
    // 获取光标所在的行对象
    const line = editor.document.lineAt(selection.active.line);
    // 检查光标的列号是否等于行内容的长度 (即位于行尾)
    // 注意：line.text.length 是内容末尾，而 line.range.end.character 包含了换行符，
    // 应该用 line.text.length 来判断是否在代码/文本的行尾。
    return selection.active.character === line.text.length;
  });
}

// TODO ✅统计光标选中行数
/**
 * 计算选区（包括多选）覆盖的总行数。
 * （此函数保持不变，用于确定主要逻辑路径）
 * @param {readonly vscode.Selection[]} selections 选区数组
 * @returns {number} 选中的总行数（去重后）
 */
function getSelectedLineCount(selections) {
  if (!selections || selections.length === 0) {
    return 0;
  }
  const lineSet = new Set();
  selections.forEach((selection) => {
    if (selection.isEmpty) {
      lineSet.add(selection.active.line);
    } else {
      const startLine = selection.start.line;
      const endLine = selection.end.line;
      for (let i = startLine; i <= endLine; i++) {
        // 核心逻辑：
        // 如果选择不是单行，并且结束点恰好是某一行的第 0 个字符（即选择从上一行拖到了下一行的开头），
        // 那么这一行 (i === endLine) 不应该计入选中行数。
        // 只有当 i < endLine，或者 i === endLine 且 selection.end.character > 0 时，才计入。
        // 或者，如果选择是单行，只要不是空的选择，就计入。
        const isEndOfLineSelection =
          i === endLine && selection.end.character === 0;
        if (isEndOfLineSelection && startLine !== endLine) {
          // 多行选择，但结束于下一行开头，不计入最后一行
          continue;
        }
        lineSet.add(i);
      }
    }
  });
  // 返回 Set 中元素的数量，即为去重后的总行数
  return lineSet.size;
}

// TODO 辅助函数：✅转义正则表达式中的特殊字符
/**
 * 辅助函数：转义正则表达式中的特殊字符
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& 表示匹配的整个字符串
}

// * === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === ===

// TODO 检查光标是否位于预定义的成对的分隔符之间
// 定义搜索的最大行数，用于防止在超大文档中性能下降
const MAX_LINES_TO_SEARCH = 50;
/**
 * 检查光标是否位于成对的分隔符之间，并返回跳转目标信息。
 * 策略：向左搜索最邻近的“未闭合”开启符，然后向右搜索其匹配的关闭符。
 * * @param {vscode.TextEditor} editor 活动编辑器
 * @param {vscode.Selection} selection 当前光标点
 * @returns {{isInside: boolean, closePosition?: vscode.Position, delimiterType?: 'structural'|'string'}}
 */
function isCursorInsidePairDelimiter(editor, selection) {
  if (!selection.isEmpty) {
    return { isInside: false };
  }
  const document = editor.document;
  const currentLine = selection.active.line;
  const position = selection.active.character;
  // 核心分隔符：开启符号 -> 对应的关闭符号
  const structuralDelimiters = { "(": ")", "{": "}", "[": "]", "<": ">" };
  const stringDelimiters = {
    '"': '"',
    "'": "'",
    "`": "`",
    '"""': '"""',
    "'''": "'''",
  };
  let openChar = null;
  let targetCloseChar = null;
  let delimiterType = null;
  // --------------------------------------------------------
  // 1. 向上/向左搜索最邻近的未闭合 'Open' 字符 (跨行/跨字符)
  // --------------------------------------------------------
  let nestedCount = 0; // 用于追踪结构分隔符的嵌套层级
  for (
    let i = currentLine;
    i >= Math.max(0, currentLine - MAX_LINES_TO_SEARCH);
    i--
  ) {
    const lineText = document.lineAt(i).text;
    const startPos = i === currentLine ? position - 1 : lineText.length - 1;
    for (let j = startPos; j >= 0; j--) {
      const char = lineText[j];
      // 检查多字符字符串分隔符 (如 """ 或 ''')
      for (const openStr in stringDelimiters) {
        if (openStr.length > 1 && j >= openStr.length - 1) {
          const foundStr = lineText.substring(j - openStr.length + 1, j + 1);
          if (foundStr === openStr) {
            // 遇到三引号，由于三引号通常不嵌套，且是最高优先级，我们视为找到
            openChar = openStr;
            targetCloseChar = stringDelimiters[openStr];
            delimiterType = "string";
            j = -1; // 跳出内层循环
            i = -1; // 跳出外层循环
            break;
          }
        }
      }
      if (openChar) break;
      // --- 结构分隔符检查 (括号、花括号、方括号) ---
      if (structuralDelimiters.hasOwnProperty(char)) {
        // 是开启符 ( ( { [ < )
        if (nestedCount === 0) {
          openChar = char;
          targetCloseChar = structuralDelimiters[char];
          delimiterType = "structural";
          j = -1;
          i = -1;
          break;
        }
        nestedCount--;
      } else if (Object.values(structuralDelimiters).includes(char)) {
        // 是关闭符 ( ) } ] > )
        nestedCount++;
      }
      // --- 单字符字符串分隔符处理 (", ', `) ---
      else if (stringDelimiters.hasOwnProperty(char)) {
        // 仅处理单引号。我们寻找最近的未闭合引号。
        // 搜索一个配对的引号，如果找到，则跳过该配对。
        let pairFound = false;
        for (let k = j - 1; k >= 0; k--) {
          if (lineText[k] === char) {
            // 找到了匹配的开启引号，意味着 (k, j) 是一对已闭合的引号。
            // 因为我们是从右向左搜索，所以这已经是最近的闭合对。
            pairFound = true;
            j = k; // 跳过这一对，从 k-1 处继续搜索
            break;
          }
        }
        if (!pairFound) {
          // 找不到左侧匹配的引号，则它可能是未闭合的开始引号
          openChar = char;
          targetCloseChar = stringDelimiters[char];
          delimiterType = "string";
          j = -1;
          i = -1;
          break;
        }
      }
    }
    if (openChar) break;
  }
  if (!openChar) {
    return { isInside: false };
  }
  // --------------------------------------------------------
  // 2. 向下/向右搜索匹配的 'Close' 字符
  // --------------------------------------------------------
  let closeLine = -1;
  let closeIndex = -1;
  nestedCount = 0; // 重置计数器，用于匹配目标关闭符
  // 如果是字符串，则不需要嵌套计数，直接找第一个匹配的关闭符
  if (delimiterType === "string" && targetCloseChar.length === 1) {
    // 字符串分隔符 (单引号) 搜索
    for (
      let i = currentLine;
      i <= Math.min(document.lineCount - 1, currentLine + MAX_LINES_TO_SEARCH);
      i++
    ) {
      const lineTextI = document.lineAt(i).text;
      const startPos = i === currentLine ? position : 0;
      if (i === currentLine) {
        // 在当前行，只搜索光标之后的部分
        const index = lineTextI.indexOf(targetCloseChar, startPos);
        if (index !== -1) {
          closeLine = i;
          closeIndex = index;
          break;
        }
      } else {
        // 在后续行，从行首开始搜索第一个
        const index = lineTextI.indexOf(targetCloseChar);
        if (index !== -1) {
          closeLine = i;
          closeIndex = index;
          break;
        }
      }
    }
  } else if (delimiterType === "string" && targetCloseChar.length > 1) {
    // 字符串分隔符 (三引号) 搜索
    const searchRegex = new RegExp(escapeRegExp(targetCloseChar), "g");
    for (
      let i = currentLine;
      i <= Math.min(document.lineCount - 1, currentLine + MAX_LINES_TO_SEARCH);
      i++
    ) {
      const lineTextI = document.lineAt(i).text;
      let startPos = i === currentLine ? position : 0;
      searchRegex.lastIndex = startPos;
      const match = searchRegex.exec(lineTextI);
      if (match) {
        closeLine = i;
        closeIndex = match.index;
        break;
      }
    }
  } else {
    // 结构分隔符 (括号) 搜索
    const singleQuotes = ['"', "'", "`"];
    const multiQuotes = ['"""', "'''"];
    for (
      let i = currentLine;
      i <= Math.min(document.lineCount - 1, currentLine + MAX_LINES_TO_SEARCH);
      i++
    ) {
      const lineTextI = document.lineAt(i).text;
      const startPos = i === currentLine ? position : 0;
      for (let j = startPos; j < lineTextI.length; j++) {
        const char = lineTextI[j];
        // 检查多字符引号 (如 Python 的三引号)
        let matchedMultiQuote = null;
        for (const multi of multiQuotes) {
          if (
            j + multi.length <= lineTextI.length &&
            lineTextI.substring(j, j + multi.length) === multi
          ) {
            matchedMultiQuote = multi;
            break;
          }
        }
        if (matchedMultiQuote) {
          // 找到多字符开启引号，跳过直到找到匹配的结束引号
          const closingIndex = lineTextI.indexOf(
            matchedMultiQuote,
            j + matchedMultiQuote.length
          );
          if (closingIndex !== -1) {
            j = closingIndex + matchedMultiQuote.length - 1; // 跳到结束引号的末尾
            continue;
          } else {
            // 未闭合的多字符引号，跳过本行剩余部分
            j = lineTextI.length;
            continue;
          }
        }
        // 检查单字符引号
        if (singleQuotes.includes(char)) {
          // 找到单字符开启引号，寻找同类型关闭引号
          const closingIndex = lineTextI.indexOf(char, j + 1);
          if (closingIndex !== -1) {
            j = closingIndex; // 跳到结束引号的位置
            continue;
          } else {
            // 未闭合的单字符引号，跳过本行剩余部分 (保守处理)
            // 仅跳到行尾，以防下一行有未闭合的结构分隔符
            // j = lineTextI.length;
            // continue;
            // 如果是结构分隔符，它可能会跨行，所以我们应该只跳过本行内已闭合的字符串
          }
        }
        // 结构分隔符匹配逻辑
        if (char === targetCloseChar) {
          if (nestedCount === 0) {
            closeLine = i;
            closeIndex = j;
            i = document.lineCount;
            break;
          }
          nestedCount--;
        } else if (char === openChar) {
          nestedCount++;
        }
      }
      if (closeLine !== -1) break;
    }
  }
  // --------------------------------------------------------
  // 3. 匹配并返回位置
  // --------------------------------------------------------
  if (closeLine !== -1) {
    const delimiterLength = targetCloseChar.length;
    // 找到关闭分隔符的位置，光标应该移动到该位置的下一位 (注意多字符分隔符的长度)
    const closePosition = new vscode.Position(
      closeLine,
      closeIndex + delimiterLength
    );
    return {
      isInside: true,
      closePosition: closePosition,
      delimiterType: delimiterType,
    };
  }
  return { isInside: false };
}

// TODO 执行 `TAB` 缩进命令
/**
 * 插件激活时调用
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log(
    'Congratulations, your extension "AVASnippetsSupport" is now active!\n恭喜，您的扩展程序“AVASnippetsSupport”现已激活！'
  );
  // 注册 package.json 中定义的命令 ID: avasnippetssupport.botTab
  let disposable = vscode.commands.registerCommand(
    "avasnippetssupport.botTab",
    () => {
      // *⭐️读取配置设置⭐️*
      const config = vscode.workspace.getConfiguration("avasnippetssupport");
      const isSmartTabEnabled = config.get("enableSmartTab", true);
      if (!isSmartTabEnabled) {
        console.log(
          "|---- Smart TAB Disabled. Executing default 'tab' command. ----|"
        );
        vscode.commands.executeCommand("editor.action.tab");
        return;
      }
      // 在 VS Code 的 "扩展主机" (Extension Host) 控制台打印信息
      console.log("\n|----AVA Snippets Active----|\n");
      // --- 获取当前编辑器和光标位置 ---
      const editor = vscode.window.activeTextEditor;
      // **************** 重要的实现细节 ****************
      if (editor) {
        const selections = editor.selections;
        const selectedLineCount = getSelectedLineCount(selections);
        // *核心修改逻辑：只要选中的行数大于 1，就执行多行缩进
        if (selectedLineCount > 1) {
          // **情况 A:选中行数 > 1（多行选中或多光标模式）=> 执行`editor.action.indentLines`缩进命令 (适用于多行选中或多个光标点)
          // 执行触发命令 `editor.action.indentLines` 行缩进
          vscode.commands.executeCommand("editor.action.indentLines");
        } else {
          // **情况 B: 单行选中或单个光标点
          const isSingleEmptySelection =
            selections.length === 1 && selections[0].isEmpty;
          if (isCursorAtEndOfLine(editor, selections)) {
            // ***情况 B.1: 光标在行尾
            // vscode.commands.executeCommand("outdent");
            vscode.commands.executeCommand("cursorRight");
          } else if (isSingleEmptySelection) {
            // ***情况 B.2：光标不在行尾，且是单个光标点
            const delimiterCheck = isCursorInsidePairDelimiter(
              editor,
              selections[0]
            );
            if (delimiterCheck.isInside) {
              // ****情况 B.2.a: 光标在成对的分隔符内
              console.log("Cursor is inside pair symbols. Jumping out.");
              const newPosition = delimiterCheck.closePosition;
              const newSelection = new vscode.Selection(
                newPosition,
                newPosition
              );
              // 结构分隔符和字符串分隔符都直接设置 selection，跳过 jumpToBracket 以保证稳定。
              editor.selection = newSelection;
              editor.revealRange(
                newSelection,
                vscode.TextEditorRevealType.InCenterIfOutsideViewport
              );
            } else {
              // ****情况 B.2.b: 光标不在行尾, 也不在成对的分隔符内
              vscode.commands.executeCommand("editor.action.indentLines");
            }
          } else {
            // **不属于上述任何情况的，执行正常的 `tab` 命令
            // vscode.commands.executeCommand("editor.action.indentLines");
            vscode.commands.executeCommand("tab");
          }
        }
      } else {
        // 没有活动的编辑器
        // *+---- 弹窗通知的实现 ----+*
        // vscode.window.showInformationMessage("这是一个信息通知！");
        // vscode.window.showWarningMessage("这是一个警告通知！");
        // vscode.window.showErrorMessage("这是一个错误通知！");
        // *+---- 带按钮的通知 ----+*
        // vscode.window
        //   .showInformationMessage("是否继续操作？", "是", "否")
        //   .then((selection) => {
        //     if (selection === "是") {
        //       vscode.window.showInformationMessage("你选择了是！");
        //     } else {
        //       vscode.window.showInformationMessage("你选择了否！");
        //     }
        //   });
        // console.log("No active text editor found.");
        vscode.window.showWarningMessage("当前没有活动的编辑窗口！");
      }
    }
  );
  context.subscriptions.push(disposable);
}

// !插件停用时调用
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
