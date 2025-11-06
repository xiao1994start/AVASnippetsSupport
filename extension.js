// extension.js

const vscode = require("vscode");

// TODO:✅检查光标位置是否在行尾
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

// TODO:✅统计光标选中行数
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
        const isEndOfLineSelection = i === endLine && selection.end.character === 0;
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

// TODO:辅助函数：✅转义正则表达式中的特殊字符
/**
 * 辅助函数：转义正则表达式中的特殊字符
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& 表示匹配的整个字符串
}

// TODO:辅助函数：✅检查当前行是否只包含空白字符或缩进
/**
 * 检查光标所在行是否为空行（只包含空格或不含任何内容）。
 * @param {vscode.TextEditor} editor 活动编辑器
 * @param {vscode.Selection} selection 当前光标点
 * @returns {boolean}
 */
function isLinePurelyWhitespace(editor, selection) {
  const line = editor.document.lineAt(selection.active.line);
  // trim() 移除行首和行尾的空白符。如果结果长度为 0，则该行只有空白字符。
  return line.text.trim().length === 0;
}

// * === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === === ===

// TODO:检查光标是否位于预定义的成对的分隔符之间
// 定义搜索的最大行数，用于防止在超大文档中性能下降
const MAX_LINES_TO_SEARCH = 50;
/**
 * 检查光标是否位于成对的分隔符之间，并返回跳转目标信息。
 * 策略：向左搜索最邻近的“未闭合”开启符，然后向右搜索其匹配的关闭符。
 * @param {vscode.Selection} selection 当前光标点
 * @returns {{isInside: boolean, closePosition?: vscode.Position, delimiterType?: 'structural'|'string'}}
 */
function isCursorInsidePairDelimiter(editor, selection) {
  if (!selection.isEmpty) {
    return { isInside: false };
  }
  const document = editor.document;
  const currentLine = selection.active.line;
  const position = selection.active.character; // 核心分隔符：开启符号 -> 对应的关闭符号
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
  // 1. 向上/向左搜索最邻近的未闭合 'Open' 字符 (跨行/跨字符)
  let nestedCount = 0; // 用于追踪结构分隔符的嵌套层级, 将字符串分隔符的向左搜索限制在当前行 (i === currentLine)
  for (let i = currentLine; i >= Math.max(0, currentLine - MAX_LINES_TO_SEARCH); i--) {
    const lineText = document.lineAt(i).text;
    const startPos = i === currentLine ? position - 1 : lineText.length - 1;
    for (let j = startPos; j >= 0; j--) {
      const char = lineText[j]; // 仅在当前行 (i === currentLine) 检查字符串分隔符
      if (i === currentLine) {
        // 检查多字符字符串分隔符 (如 """ 或 ''')
        for (const openStr in stringDelimiters) {
          if (openStr.length > 1 && j >= openStr.length - 1) {
            const foundStr = lineText.substring(j - openStr.length + 1, j + 1);
            if (foundStr === openStr) {
              // 遇到三引号，我们视为找到（仅限于当前行）
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
        // --- 单字符字符串分隔符处理 (", ', `) ---
        else if (stringDelimiters.hasOwnProperty(char)) {
          // 仅处理单引号。我们寻找最近的未闭合引号。（仅限于当前行）
          // 搜索一个配对的引号，如果找到，则跳过该配对。
          let pairFound = false;
          for (let k = j - 1; k >= 0; k--) {
            if (lineText[k] === char) {
              // 找到了匹配的开启引号，意味着 (k, j) 是一对已闭合的引号。
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
      } // end if (i === currentLine)
      if (openChar) break; // --- 结构分隔符检查 (括号、花括号、方括号) --- (允许跨行)
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
    }
    if (openChar) break;
  }
  if (!openChar) {
    return { isInside: false };
  }
  // 2. 向下/向右搜索匹配的 'Close' 字符
  let closeLine = -1;
  let closeIndex = -1;
  nestedCount = 0; // 重置计数器，用于匹配目标关闭符, 字符串分隔符的搜索限制在当前行 (i === currentLine)
  if (delimiterType === "string") {
    // 字符串分隔符 (单引号/三引号) 搜索：仅在当前行查找
    let i = currentLine;
    const lineTextI = document.lineAt(i).text;
    const startPos = position;
    if (targetCloseChar.length === 1) {
      // 单字符字符串分隔符搜索
      const index = lineTextI.indexOf(targetCloseChar, startPos);
      if (index !== -1) {
        closeLine = i;
        closeIndex = index;
      }
    } else {
      // 多字符字符串分隔符搜索
      const searchRegex = new RegExp(escapeRegExp(targetCloseChar), "g");
      searchRegex.lastIndex = startPos;
      const match = searchRegex.exec(lineTextI);
      if (match) {
        closeLine = i;
        closeIndex = match.index;
      }
    }
  } else {
    // 结构分隔符 (括号) 搜索
    const singleQuotes = ['"', "'", "`"];
    const multiQuotes = ['"""', "'''"];
    for (let i = currentLine; i <= Math.min(document.lineCount - 1, currentLine + MAX_LINES_TO_SEARCH); i++) {
      const lineTextI = document.lineAt(i).text;
      const startPos = i === currentLine ? position : 0;
      for (let j = startPos; j < lineTextI.length; j++) {
        const char = lineTextI[j]; // 结构分隔符搜索时，仅检查当前行中的字符串配对，并跳过
        if (i === currentLine) {
          // 检查多字符引号 (如 Python 的三引号)
          let matchedMultiQuote = null;
          for (const multi of multiQuotes) {
            if (j + multi.length <= lineTextI.length && lineTextI.substring(j, j + multi.length) === multi) {
              matchedMultiQuote = multi;
              break;
            }
          }
          if (matchedMultiQuote) {
            // 找到多字符开启引号，跳过直到找到匹配的结束引号
            const closingIndex = lineTextI.indexOf(matchedMultiQuote, j + matchedMultiQuote.length);
            if (closingIndex !== -1) {
              j = closingIndex + matchedMultiQuote.length - 1; // 跳到结束引号的末尾
              continue;
            } else {
              // 未闭合的多字符引号，跳过本行剩余部分
              j = lineTextI.length;
              continue;
            }
          } // 检查单字符引号
          if (singleQuotes.includes(char)) {
            // 找到单字符开启引号，寻找同类型关闭引号
            const closingIndex = lineTextI.indexOf(char, j + 1);
            if (closingIndex !== -1) {
              j = closingIndex; // 跳到结束引号的位置
              continue;
            } else {
              // 如果单引号未在行内闭合，则认为结构分隔符搜索逻辑被中断
              // 为了避免跨行字符串干扰，我们允许其继续检查，仅在找到配对时跳过
            }
          }
        } // 结构分隔符匹配逻辑
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
  // 3. 匹配并返回位置
  if (closeLine !== -1) {
    const delimiterLength = targetCloseChar.length; // 找到关闭分隔符的位置，光标应该移动到该位置的下一位 (注意多字符分隔符的长度)
    const closePosition = new vscode.Position(closeLine, closeIndex + delimiterLength);
    return {
      isInside: true,
      closePosition: closePosition,
      delimiterType: delimiterType,
    };
  }
  return { isInside: false };
}

// TODO:定义所有要检查的成对分隔符(键是开分隔符)
/**
 * * 判断优先级按照字典顺序 先判断 -> 后判断
 */

const PAIRED_DELIMITERS = {
  "'": "'",
  '"': '"',
  "(": ")",
  "{": "}",
  "[": "]",
  "<": ">",
  '"""': '"""', // Python 等多行字符串
  "'''": "'''", // Python 等多行字符串
};
// TODO:辅助函数：判断光标右侧同一行内是否存在一个完整的成对分隔符结构
/**
 * 辅助函数：判断光标右侧同一行内是否存在一个完整的成对分隔符结构
 *
 * @param lineText: string 光标所在行的完整文本。
 * @param characterIndex: number 光标的字符索引。
 * @returns : string | null 如果光标右侧存在一个开分隔符，且同一行稍后存在其对应的闭分隔符，则返回该开分隔符的字符串；否则返回 null。
 */
function hasPairDelimiterRight(lineText, characterIndex) {
  // 获取光标右侧的所有文本
  const textAfterCursor = lineText.substring(characterIndex);

  // 遍历所有分隔符（先检查多字符，再检查单字符，以确保 """ 优先于 " 被检查）
  const sortedDelimiters = Object.keys(PAIRED_DELIMITERS).sort((a, b) => b.length - a.length);

  for (const openDelim of sortedDelimiters) {
    const closeDelim = PAIRED_DELIMITERS[openDelim];

    // 查找开分隔符在光标右侧文本中的位置
    const openIndex = textAfterCursor.indexOf(openDelim);

    if (openIndex !== -1) {
      // 开分隔符已找到。现在检查闭分隔符是否存在。

      // 从开分隔符结束的位置开始查找闭分隔符
      const searchStartIndex = openIndex + openDelim.length;
      const closeIndex = textAfterCursor.indexOf(closeDelim, searchStartIndex);

      if (closeIndex !== -1) {
        // 找到了开分隔符和闭分隔符，且它们在同一行，返回开分隔符。
        return openDelim;
      }
    }
  }

  return null;
}

// TODO:将光标位置移动到找到的第一个成对的分隔符内
/**
 * 辅助函数：将光标位置移动到找到的第一个成对的分隔符内（即跳过开分隔符）。
 *
 * @param editor: vscode.TextEditor 当前活动的文本编辑器。
 * @param position: vscode.Position 当前光标位置。
 * @param openDelimiter: string 找到的成对分隔符的开分隔符字符串。
 */
function jumpInside(editor, position, openDelimiter) {
  const lineText = editor.document.lineAt(position.line).text;
  const textAfterCursor = lineText.substring(position.character);

  // 查找开分隔符在光标右侧文本中的位置
  const openIndex = textAfterCursor.indexOf(openDelimiter);

  if (openIndex === -1) {
    // 理论上不会发生，因为在 hasPairDelimiterRight 中已经找到
    return;
  }

  // 计算新的字符索引：当前光标位置 + 开分隔符在右侧文本中的起始索引 + 开分隔符本身的长度
  const newCharacter = position.character + openIndex + openDelimiter.length;

  // 创建并设置新的光标位置
  const finalPosition = position.with(position.line, newCharacter);
  const finalSelection = new vscode.Selection(finalPosition, finalPosition);

  editor.selection = finalSelection;
  // 确保光标可见
  editor.revealRange(finalSelection);
}

// TODO:将光标跳转到分隔符外
/**
 * 传入`isCursorInsidePairDelimiter`方法返回[object Object]对象，将光标跳转到分隔符外
 * @param {delimiterCheck} delimiterCheck `isCursorInsidePairDelimiter`方法返回[object Object]对象
 * @returns 光标跳转到分隔符外
 */
function jumpOut(editor, delimiterCheck) {
  const newPosition = delimiterCheck.closePosition;
  const newSelection = new vscode.Selection(newPosition, newPosition);
  // 结构分隔符和字符串分隔符都直接设置 selection，跳过 jumpToBracket 以保证稳定。
  editor.selection = newSelection;
  editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// TODO:执行 `TAB` 缩进命令
/**
 * 插件激活时调用
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("🎉恭喜，您的扩展程序“AVASnippetsSupport”现已激活！🎉");
  // 注册 package.json 中定义的命令 ID: avasnippetssupport.botTab
  let disposable = vscode.commands.registerCommand("avasnippetssupport.botTab", async () => {
    // *⭐️读取配置设置⭐️*
    const config = vscode.workspace.getConfiguration("avasnippetssupport");
    const isSmartTabEnabled = config.get("enableSmartTab", true);
    if (!isSmartTabEnabled) {
      console.log("|---- 智能 TAB 已禁用。正在执行默认的 `tab` 命令 ----|");
      vscode.commands.executeCommand("editor.action.tab");
      return;
    }
    // 在 VS Code 的 "扩展主机" (Extension Host) 控制台打印信息
    console.log("\n|----AVA Snippets Active----|\n");
    // --- 获取当前编辑器和光标位置 ---
    const editor = vscode.window.activeTextEditor; // TODO:获取当前激活的编辑器对象方法
    // !⛔没有活动的编辑器⛔
    if (!editor) {
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
      return context.subscriptions.push(disposable);
    }

    // *✅重要的实现细节✅*
    const selections = editor.selections; // *获取当前编辑器中所有选区的数组

    // *⭕ 获取基础判断所需的变量 ⭕*
    const selectedLineCount = getSelectedLineCount(selections); // *检查光标选中行数
    console.log(`🔵当前选中行数:${selectedLineCount}`);
    const selectedCount = selections.length; // *获取光标数量
    console.log(`🔵当前光标数量:${selectedCount}`);
    const isSelection = !selections[0].isEmpty; // *没有选中文本，光标只是一个点
    console.log(`🔵当前选中文本:${isSelection}`);
    const isEndLine = isCursorAtEndOfLine(editor, selections); // *检查光标位置是否在行尾
    console.log(`🔵光标是否行尾:${isEndLine}`);
    const isEmptyLine = isLinePurelyWhitespace(editor, selections[0]); // *判断光标所在行是否为纯空白行
    console.log(`🔵光标在空白行:${isEmptyLine}`);
    const delimiterCheck = isCursorInsidePairDelimiter(editor, selections[0]); // *分隔符检查 -> [object Object]对象
    const insideDelimiter = delimiterCheck.isInside; // *光标是否在成对的分隔符内
    console.log(`🔵分隔符检查=>光标在成对的分隔符内:${insideDelimiter}`);

    // *⁉️判断:选中文本为真
    if (isSelection) {
      console.log(`🟢选中${isSelection} => 行缩进`);
      // TODO:执行触发命令 `editor.action.indentLines` 行缩进
      vscode.commands.executeCommand("editor.action.indentLines");
      return context.subscriptions.push(disposable);
    }

    // *⁉️判断:选中行数 === 1
    if (selectedLineCount === 1) {
      // TODO:仅在光标选中行数唯一时获取变量
      const position = editor.selection.active; // *获取当前活动光标的位置
      const lineText = editor.document.lineAt(position.line).text; // *获取当前光标所在行的完整文本内容
      const textBeforeCursor = lineText.substring(0, position.character); // *获取光标左侧的文本
      // 使用正则表达式检查光标左侧的文本是否全为空白字符 (空格或 Tab)
      // 匹配规则: /^[\s]*$/ => 表示从行首开始，匹配零个或多个空白字符（包括空格、Tab 等），直到光标位置
      const isCursorAtStartOfContent = /^[\s]*$/.test(textBeforeCursor); // *使用正则表达式检查光标左侧的文本是否全为空白字符
      console.log(`🔵光标左侧空白字符:${isCursorAtStartOfContent}`);
      const openDelimiter = hasPairDelimiterRight(lineText, position.character); // *检查选中行光标右侧否存在一个完整的成对分隔符结构 => 找到的成对分隔符的开分隔符字符串 | null
      console.log(`🔵光标右侧成对分隔符结构:${Boolean(openDelimiter)}`);

      // *⁉️判断:光标左侧空白(光标在行开头区域)
      if (isCursorAtStartOfContent) {
        console.log(`🟢选中行数 === 1;左侧空白:${isCursorAtStartOfContent} => 行缩进`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        return context.subscriptions.push(disposable);
      }
      // *⁉️判断:光标在成对的分隔符内
      if (insideDelimiter) {
        console.log(`🟢选中行数 === 1;光标在成对的分隔符内:${insideDelimiter} => 跳出分隔符外`);
        // TODO:执行 `jumpOut` 方法 => 跳出分隔符外
        jumpOut(editor, delimiterCheck);
        return context.subscriptions.push(disposable);
      }
      // *⁉️判断:光标不在成对的分隔符内 且 光标右侧有成对分隔符结构
      if (openDelimiter) {
        console.log(`🟢选中行数 === 1;光标右侧有成对分隔符结构 => 跳入分隔符内`);
        // TODO:执行 `jumpInside` 方法 => 跳入分隔符内
        jumpInside(editor, position, openDelimiter);
        return context.subscriptions.push(disposable);
      }
      if (isEndLine) {
        // *⁉️判断:光标在行尾
        // console.log(`🟢选中行数 === 1;行尾:${isEndLine} => 行减少缩进`);
        // // TODO:执行触发命令 `outdent` 行减少缩进
        // vscode.commands.executeCommand("outdent");
        console.log(`🟢选中行数 === 1;行尾:${isEndLine} => 光标向右移动一个字符`);
        // TODO:执行触发命令 `cursorRight` 光标向右移动一个字符
        vscode.commands.executeCommand("cursorRight");
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:选中行数 < 光标数 且 光标不在行尾
      if (selectedLineCount < selectedCount && !isEndLine) {
        console.log(`🟢选中行数 === 1;${selectedCount}光标;行尾:${isEndLine} => 行缩进 && 行减少缩进 ${selectedCount - 1} 次`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进,执行一次后需要再执行 (selectedCount - 1) 次 `outdent` 行减少缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        var loopCount = selectedCount - 1;
        for (let i = 0; i < loopCount; i++) {
          vscode.commands.executeCommand("outdent");
        }
        return context.subscriptions.push(disposable);
      }
    }

    // *⁉️判断:选中行数 > 1
    if (selectedLineCount > 1) {
      // *⁉️判断:选中行数 > 光标数 且 光标不在行尾，选中行数 > 1 或 选中文本为真
      if (selectedLineCount > selectedCount && !isEndLine && (selectedLineCount > 1 || isSelection)) {
        console.log(`🟢${selectedLineCount}行;${selectedCount}光标;选中${isSelection};行尾:${isEndLine} => 行缩进`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        return context.subscriptions.push(disposable);
      }
    }

    console.log("🔴当前处于未指定状态,执行默认`TAB`命令");
    // **不属于上述任何情况的,执行默认`TAB`命令**
    vscode.commands.executeCommand("tab");
    return context.subscriptions.push(disposable);
  });

  // TODO:资源清理和生命周期管理
  console.log("----🗑资源清理和生命周期管理🚮----");
  context.subscriptions.push(disposable);
}

// !插件停用时调用
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
