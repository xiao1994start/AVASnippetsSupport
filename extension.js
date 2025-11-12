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

// TODO:[辅助函数]✅转义正则表达式中的特殊字符
/**
 * 辅助函数：转义正则表达式中的特殊字符
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& 表示匹配的整个字符串
}

// TODO:[辅助函数]✅检查当前行是否只包含空白字符或缩进
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
// *定义搜索的最大行数，用于防止在超大文档中性能下降
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
  const position = selection.active.character;

  const structuralDelimiters = { "(": ")", "{": "}", "[": "]", "<": ">" };
  // 简化字符串分隔符：我们只找单字符引号，三引号交给语言服务器或语法高亮处理
  // 但为了兼容您原有的三引号逻辑，我们保留定义，但在搜索中简化处理。
  const stringDelimiters = { '"': '"', "'": "'", "`": "`", '"""': '"""', "'''": "'''" };
  const allQuotes = { ...stringDelimiters }; // 仅用于快速检查是否为引号

  let openChar = null;
  let targetCloseChar = null;
  let delimiterType = null;

  // --- 1. 向上/向左搜索最邻近的未闭合 'Open' 字符 ---

  let nestedCount = 0; // 用于追踪结构分隔符的嵌套层级

  for (let i = currentLine; i >= Math.max(0, currentLine - MAX_LINES_TO_SEARCH); i--) {
    const lineText = document.lineAt(i).text;
    const startPos = i === currentLine ? position - 1 : lineText.length - 1;

    for (let j = startPos; j >= 0; j--) {
      const char = lineText[j];
      // 检查转义字符
      if (char === "\\") {
        continue; // 忽略转义字符本身
      }
      // A. 检查结构分隔符 (允许跨行)
      if (structuralDelimiters.hasOwnProperty(char)) {
        // 是开启符 ( ( { [ < )
        if (nestedCount === 0) {
          // 找到最邻近的未闭合开启符
          openChar = char;
          targetCloseChar = structuralDelimiters[char];
          delimiterType = "structural";
          i = -1; // 跳出外层循环
          break;
        }
        nestedCount--;
      } else if (Object.values(structuralDelimiters).includes(char)) {
        // 是关闭符 ( ) } ] > )
        nestedCount++;
      }
      // B. 检查字符串分隔符 (仅在当前行，且只作为最优先匹配)
      if (i === currentLine && allQuotes.hasOwnProperty(char)) {
        // 如果在当前行光标左侧找到一个引号，并且在它左侧找不到匹配的引号，
        // 则认为光标在字符串内部，这个引号是未闭合的开始引号。
        let pairFound = false;
        for (let k = j - 1; k >= 0; k--) {
          if (lineText[k] === char && lineText[k - 1] !== "\\") {
            // 找到了匹配的开启引号，且未被转义
            pairFound = true;
            j = k; // 跳过这一对
            break;
          }
        }
        if (!pairFound) {
          // 找不到左侧匹配的引号，则它可能是未闭合的开始引号
          openChar = char;
          targetCloseChar = allQuotes[char];
          delimiterType = "string";
          i = -1; // 跳出外层循环
          break;
        }
      }
    }
    if (openChar) break;
  }
  if (!openChar) {
    return { isInside: false };
  }

  // --- 2. 向下/向右搜索匹配的 'Close' 字符 ---

  let closeLine = -1;
  let closeIndex = -1;
  nestedCount = 0;
  for (let i = currentLine; i <= Math.min(document.lineCount - 1, currentLine + MAX_LINES_TO_SEARCH); i++) {
    const lineTextI = document.lineAt(i).text;
    const startPos = i === currentLine ? position : 0;

    for (let j = startPos; j < lineTextI.length; j++) {
      const char = lineTextI[j];
      // 检查转义字符
      if (char === "\\") {
        j++; // 跳过下一个被转义的字符
        continue;
      }
      // A. 字符串分隔符搜索：仅在找到 'string' 类型开启符时搜索其匹配的关闭符
      if (delimiterType === "string" && char === targetCloseChar) {
        // 如果是字符串分隔符，我们找到第一个匹配的关闭符即可
        closeLine = i;
        closeIndex = j;
        i = document.lineCount; // 立即终止搜索
        break;
      }

      // B. 结构分隔符搜索：需要跳过字符串内容，并处理嵌套
      if (delimiterType === "structural") {
        // 忽略被引号包裹的内容 (仅处理单字符引号)
        if (allQuotes.hasOwnProperty(char)) {
          // 找到开启引号，寻找同类型关闭引号 (忽略转义)
          let closingIndex = -1;
          for (let k = j + 1; k < lineTextI.length; k++) {
            if (lineTextI[k] === char && lineTextI[k - 1] !== "\\") {
              closingIndex = k;
              break;
            }
          }
          if (closingIndex !== -1) {
            j = closingIndex; // 跳到结束引号的位置
            continue;
          } else if (char === targetCloseChar) {
            // 这是一个关闭引号，但它与结构分隔符相同，且未闭合，
            // 为了简化，我们只处理已闭合的字符串跳过
            // 如果未闭合，则认为它可能影响嵌套计数，继续执行下面的结构分隔符逻辑
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
    }
    if (closeLine !== -1) break;
  }

  // --- 3. 匹配并返回位置 ---
  if (closeLine !== -1) {
    // 关闭分隔符的长度
    const delimiterLength = targetCloseChar.length;
    // 光标应该移动到该位置的下一位
    const closePosition = new vscode.Position(closeLine, closeIndex + delimiterLength);
    // 如果是字符串分隔符，检查它是否被转义
    if (delimiterType === "string" && closeIndex > 0 && document.lineAt(closeLine).text[closeIndex - 1] === "\\") {
      return { isInside: false }; // 忽略被转义的引号
    }
    return {
      isInside: true,
      closePosition: closePosition,
      delimiterType: delimiterType,
    };
  }

  return { isInside: false };
}

// TODO:定义所有要检查的成对分隔符(键是开分隔符)
const PAIRED_DELIMITERS = {
  // *判断优先级按照字典顺序 先判断 -> 后判断
  "(": ")",
  "{": "}",
  "[": "]",
  "<": ">",
  "'": "'",
  '"': '"',
  '"""': '"""', // Python 等多行字符串
  "'''": "'''", // Python 等多行字符串
};
// TODO:[辅助函数]判断光标右侧同一行内是否存在一个完整的成对的分隔符结构
/**
 * 辅助函数：判断光标右侧同一行内是否存在一个完整的成对的分隔符结构
 *
 * @param lineText: string 光标所在行的完整文本。
 * @param characterIndex: number 光标的字符索引。
 * @returns : string | null 如果光标右侧存在一个开分隔符，且同一行稍后存在其对应的闭分隔符，则返回该开分隔符的字符串；否则返回 null。
 * * *【重要修改】*：返回距离光标最近（即 openIndex 最小）的开分隔符。
 */
function hasPairDelimiterRight(lineText, characterIndex) {
  // 获取光标右侧的所有文本
  const textAfterCursor = lineText.substring(characterIndex);

  // 记录最近找到的开分隔符及其在 textAfterCursor 中的起始索引
  let closestOpenDelimiter = null;
  let minOpenIndex = Infinity;

  // 遍历所有分隔符（先检查多字符，再检查单字符，确保 "优先于" 等被检查）
  // 排序的目的是确保多字符分隔符（如 """）能被正确检测，但此处主要依赖 indexOf 的结果。
  // 我们可以简化为直接遍历 Object.keys。
  const sortedDelimiters = Object.keys(PAIRED_DELIMITERS).sort((a, b) => b.length - a.length);

  for (const openDelim of sortedDelimiters) {
    const closeDelim = PAIRED_DELIMITERS[openDelim];

    // 查找开分隔符在光标右侧文本中的位置
    let openIndex = textAfterCursor.indexOf(openDelim);

    // 使用循环处理同一行中可能重复的分隔符，直到找到满足条件的最近的一个
    while (openIndex !== -1) {
      // 从开分隔符结束的位置开始查找闭分隔符
      const searchStartIndex = openIndex + openDelim.length;
      const closeIndex = textAfterCursor.indexOf(closeDelim, searchStartIndex);

      if (closeIndex !== -1) {
        // 找到了完整的成对分隔符结构 (openDelim 和 closeDelim 在同一行)
        // 检查它是否比目前找到的最近的分隔符更近
        if (openIndex < minOpenIndex) {
          minOpenIndex = openIndex;
          closestOpenDelimiter = openDelim;
        }
        // 由于我们找到了一个有效的结构，并且我们只关心最近的那个，
        // 如果当前找到的 openIndex 已经比 minOpenIndex 大了，那么后续的搜索就没有必要了
        // 但因为我们是按分隔符类型遍历的，所以继续下一个分隔符类型的搜索，
        // 并在找到时更新 minOpenIndex 即可。

        // 这里我们只需要找到第一个完整的结构即可满足当前 openIndex 的判断。
        // 为了确保找到的是最近的，我们将 break 替换为继续搜索下一个分隔符类型。

        // 找到后，跳出当前 `while` 循环，检查下一个分隔符类型。
        break;
      }
      // 如果没找到匹配的闭分隔符，继续向右搜索当前分隔符类型，
      // 但对于 Smart Tab 的需求，通常只关心第一个完整的结构。
      // 鉴于此函数的目的是“判断右侧是否存在”，我们应该只关注最近的那个。

      // 优化：为了防止无限循环和简化逻辑，如果找不到闭分隔符，我们停止在这个 openIndex 上的搜索。
      // 但如果 openIndex < minOpenIndex，我们应该记录它。

      // 为了简化并严格确保最近性，我们不使用 while 循环，只取第一个 indexOf 结果。
      // 让我们恢复到只检查第一次出现，并记录最近的结果。

      // *回退到只检查第一次出现，并记录最近的结果的逻辑，以简化代码：*

      // 如果找不到闭分隔符，这个 openIndex 上的搜索就结束了。
      break; // 结束 while 循环
    }
    // 重新检查 for 循环体内的逻辑，确保只检查第一次出现，并记录最近的结果
    // 我们需要确保逻辑是：对于*所有*分隔符，找到第一个出现的完整对，并记录最近的那个。
  }
  // 恢复简化逻辑，只取第一次出现的完整对，并比较哪个更近
  // 1. 重新初始化变量：
  minOpenIndex = Infinity;
  closestOpenDelimiter = null;

  for (const openDelim of sortedDelimiters) {
    const closeDelim = PAIRED_DELIMITERS[openDelim];

    // 查找开分隔符在光标右侧文本中的第一次出现的位置
    const openIndex = textAfterCursor.indexOf(openDelim);

    if (openIndex !== -1) {
      // 开分隔符已找到。检查闭分隔符是否存在。
      const searchStartIndex = openIndex + openDelim.length;
      const closeIndex = textAfterCursor.indexOf(closeDelim, searchStartIndex);

      if (closeIndex !== -1) {
        // 找到了完整的成对分隔符结构
        if (openIndex < minOpenIndex) {
          // 比当前记录的更近
          minOpenIndex = openIndex;
          closestOpenDelimiter = openDelim;
        }
      }
    }
  }
  return closestOpenDelimiter;
}

// TODO:[辅助函数]✅检查光标右侧是否存在对应的结束分隔符
/**
 * 检查光标所在行内，在光标右侧相邻或距离n个空格的位置是否存在
 * 包括 '"""', "'''", ")", "}", "]", ">", '"', "'", "`", ";", ":",
 * 成对分隔符对应的结束符号。
 * * @param {vscode.TextEditor} editor 活动编辑器
 * @param {vscode.Position} position 当前光标位置
 * @param {number} maxSpaces 允许的最大空格数间隔 (n)
 * @returns {boolean} 如果在允许的间隔内找到结束分隔符，则返回 true。
 */
function isCloseDelimiterRightAhead(editor, position, maxSpaces = 64) {
  const document = editor.document;
  const lineText = document.lineAt(position.line).text;

  // 获取光标右侧的文本
  let textAfterCursor = lineText.substring(position.character);

  // 定义所有可能的闭合分隔符，并按长度降序排列，确保 '"""' 优先于 '"' 被检查
  const closeDelimiters = [
    '"""', // 多行字符串
    "'''", // 多行字符串
    ")",
    "}",
    "]",
    ">",
    '"',
    "'",
    "`",
    ";",
    ":",
  ];

  // 构造一个正则表达式，用于匹配 [0 到 maxSpaces 个空格] 后面跟着 [任意一个闭合分隔符]
  // 这里的正则表达式需要转义所有分隔符中的特殊字符（例如 '()' 等），尽管对于闭合符来说，大部分都不是特殊字符。
  // 但是为了稳健性，最好对所有分隔符进行转义并用 '|' 连接。

  const escapedDelimiters = closeDelimiters.map(escapeRegExp).join("|");

  // 匹配规则：^：从字符串开头（即光标位置）开始匹配
  // [\s]：匹配任何空白字符 (空格、Tab等)。注意：如果只允许空格，应该用 ' '。
  // {0,${maxSpaces}}：匹配 0 到 maxSpaces 次。
  // (${escapedDelimiters})：匹配任何一个闭合分隔符。
  const regex = new RegExp(`^[\\s]{0,${maxSpaces}}(${escapedDelimiters})`);

  const match = textAfterCursor.match(regex);

  if (match) {
    // 匹配成功，match[1] 是捕获到的实际闭合分隔符（例如 ")", '"' 等）
    const foundDelimiter = match[1];

    // 【重要】我们还需要确认找到的分隔符前面没有转义字符，特别是引号。
    // 如果找到的字符是引号，且光标左侧紧挨着的是 '\'，通常不需要处理，
    // 但如果找到的引号前面有空格，转义检查的意义不大。
    // 这里的重点是：确保找到的闭合符*未被转义*，但在光标右侧的搜索中，
    // 只需要看它前面是不是空格，然后判断它自己是不是闭合符。

    // 进一步细化：如果找到的分隔符是引号，我们应该跳过它前面可能存在的空格
    // 找到分隔符在 `textAfterCursor` 中的起始索引
    const delimiterStart = match[0].length - foundDelimiter.length;

    // 检查光标右侧紧邻分隔符的字符是否是转义符 '\'
    // 字符在 `lineText` 中的实际索引是：position.character + delimiterStart - 1
    const charBeforeDelimiterIndex = position.character + delimiterStart - 1;

    if (foundDelimiter.length === 1 && (foundDelimiter === '"' || foundDelimiter === "'") && charBeforeDelimiterIndex >= 0) {
      // 检查单引号/双引号前面是否有转义符
      if (lineText[charBeforeDelimiterIndex] === "\\") {
        // 被转义的引号，我们不认为是有效的闭合符
        return false;
      }
    }

    // 找到了有效的闭合分隔符
    return true;
  }

  return false;
}

// TODO:[辅助函数]将光标位置移动到找到的第一个成对的分隔符内
/**
 * 辅助函数：将光标位置移动到找到的第一个成对的分隔符内（即跳过开分隔符）。
 *
 * @param editor: vscode.TextEditor 当前活动的文本编辑器。
 * @param position: vscode.Position 当前光标位置。
 * @param leftBracket: string 找到的成对分隔符的开分隔符字符串。
 */
function jumpInside(editor, position, leftBracket) {
  const lineText = editor.document.lineAt(position.line).text;
  const textAfterCursor = lineText.substring(position.character);

  // 查找开分隔符在光标右侧文本中的位置
  const openIndex = textAfterCursor.indexOf(leftBracket);

  if (openIndex === -1) {
    // 理论上不会发生，因为在 hasPairDelimiterRight 中已经找到
    return;
  }

  // 计算新的字符索引：当前光标位置 + 开分隔符在右侧文本中的起始索引 + 开分隔符本身的长度
  const newCharacter = position.character + openIndex + leftBracket.length;

  // 创建并设置新的光标位置
  const finalPosition = position.with(position.line, newCharacter);
  const finalSelection = new vscode.Selection(finalPosition, finalPosition);

  editor.selection = finalSelection;
  // 确保光标可见
  editor.revealRange(finalSelection);
}

// TODO:✅将光标跳转到分隔符外
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

    const isEmptyLine = isLinePurelyWhitespace(editor, selections[0]); // *判断光标所在行是否为纯空白行
    console.log(`🔵光标在空白行:${isEmptyLine}`);

    const delimiterCheck = isCursorInsidePairDelimiter(editor, selections[0]); // *分隔符检查 -> [object Object]对象
    const isInBracket = delimiterCheck.isInside; // *光标是否在跨行成对的分隔符内
    console.log(`🔵分隔符检查=>光标在跨行成对的分隔符内:${isInBracket}`);

    // *⁉️判断:选中文本为真
    if (isSelection) {
      console.log(`🟢选中${isSelection} => 行缩进`);
      // TODO:执行触发命令 `editor.action.indentLines` 行缩进
      vscode.commands.executeCommand("editor.action.indentLines");
      return context.subscriptions.push(disposable);
    }

    // TODO:逻辑判断(条件:复杂条件>简单条件)

    // *⁉️判断:选中行数 == 1
    if (selectedLineCount === 1) {
      // TODO:仅在光标选中行数唯一时获取变量
      const position = editor.selection.active; // *获取当前活动光标的位置
      const lineText = editor.document.lineAt(position.line).text; // *获取当前光标所在行的完整文本内容
      const textBeforeCursor = lineText.substring(0, position.character); // *获取光标左侧的文本
      // 使用正则表达式检查光标左侧的文本是否全为空白字符 (空格或 Tab)
      // 匹配规则: /^[\s]*$/ => 表示从行首开始，匹配零个或多个空白字符（包括空格、Tab 等），直到光标位置
      const isCursorAtStartOfContent = /^[\s]*$/.test(textBeforeCursor); // *使用正则表达式检查光标左侧的文本是否全为空白字符
      console.log(`🔵光标左侧空白字符:${isCursorAtStartOfContent}`);

      const isEndLine = isCursorAtEndOfLine(editor, selections); // *检查光标位置是否在行尾
      console.log(`🔵光标是否行尾:${isEndLine}`);

      const bracketContent = hasPairDelimiterRight(lineText, position.character); // *检查选中行光标右侧否存在一个完整的成对分隔符结构 => 找到的成对分隔符的开分隔符字符串 | null
      console.log(`🔵分隔符检查=>光标右侧成对分隔符结构:${Boolean(bracketContent)}`);

      const isCloseDelimiterAhead = isCloseDelimiterRightAhead(editor, selections[0].active); // *检查光标右侧是否存在闭合分隔符
      console.log(`🔵分隔符检查=>右侧相邻闭合分隔符:${isCloseDelimiterAhead}`);

      // *⁉️判断:选中行数 < 光标数 且 光标不在行尾
      if (selectedLineCount < selectedCount && !isEndLine) {
        console.log(`🟢选中行数 < 光标数 且 光标不在行尾🟢 => 行缩进 && 行减少缩进 ${selectedCount - 1} 次`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进,执行一次后需要再执行 (selectedCount - 1) 次 `outdent` 行减少缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        var loopCount = selectedCount - 1;
        for (let i = 0; i < loopCount; i++) {
          vscode.commands.executeCommand("outdent");
        }
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标在跨行分隔符内 且 右侧空白后接成对分隔符的关闭符
      if (isInBracket && isCloseDelimiterAhead) {
        console.log(`🟢光标在跨行分隔符内 且 右侧空白后接成对分隔符的关闭符🟢 => 跳出分隔符外`);
        // TODO:执行 `jumpOut` 方法 => 跳出分隔符外
        jumpOut(editor, delimiterCheck);
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标 行首 且 行尾
      if (isCursorAtStartOfContent && isEndLine) {
        console.log(`🟢光标 行首 且 行尾🟢 => TAB`);
        // TODO:执行触发命令 `tab`
        vscode.commands.executeCommand("tab");
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标左侧空白(光标在行开头区域)
      if (isCursorAtStartOfContent) {
        console.log(`🟢光标左侧空白🟢 => 行缩进`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标不在成对分隔符内 且 光标右侧有成对分隔符结构
      if (bracketContent) {
        console.log(`🟢光标不在成对分隔符内 且 光标右侧有成对分隔符结构🟢 => 跳入分隔符内`);
        // TODO:执行 `jumpInside` 方法 => 跳入分隔符内
        jumpInside(editor, position, bracketContent);
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标在行尾
      if (isEndLine) {
        // console.log(`🟢光标在行尾🟢 => 行减少缩进`);
        // // TODO:执行触发命令 `outdent` 行减少缩进
        // vscode.commands.executeCommand("outdent");
        console.log(`🟢光标在行尾🟢 => 光标向右移动一个字符`);
        // TODO:执行触发命令 `cursorRight` 光标向右移动一个字符
        vscode.commands.executeCommand("cursorRight");
        return context.subscriptions.push(disposable);
      }

      // *⁉️判断:光标在跨行成对的分隔符内
      if (isInBracket) {
        console.log(`🟢光标在跨行成对的分隔符内🟢 => 跳出分隔符外`);
        // TODO:执行 `jumpOut` 方法 => 跳出分隔符外
        jumpOut(editor, delimiterCheck);
        return context.subscriptions.push(disposable);
      }
    }

    // *⁉️判断:选中行数 > 1
    if (selectedLineCount > 1) {
      // *⁉️判断:选中行数 > 光标数 且 光标不在行尾，选中行数 > 1 或 选中文本为真
      if (selectedLineCount > selectedCount && !isEndLine && (selectedLineCount > 1 || isSelection)) {
        console.log(`🟢选中行数 > 光标数 且 光标不在行尾，选中行数 > 1 或 选中文本为真🟢 => 行缩进`);
        // TODO:执行触发命令 `editor.action.indentLines` 行缩进
        vscode.commands.executeCommand("editor.action.indentLines");
        return context.subscriptions.push(disposable);
      }
    }

    console.log("🔴当前处于未指定状态🔴 => 执行默认`TAB`命令");
    // **不属于上述任何情况的,执行默认`TAB`命令**
    vscode.commands.executeCommand("tab");
    return context.subscriptions.push(disposable);
  });

  // TODO:资源清理和生命周期管理
  console.log("----🚮🗑资源清理和生命周期管理🗑🚮----");
  context.subscriptions.push(disposable);
}

// !插件停用时调用
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
