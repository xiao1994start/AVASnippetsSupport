@ECHO OFF
setlocal EnableDelayedExpansion
CD /D "%~dp0"


@REM  统计 snippets 目录下所有 json 文件的数量
set /a "count=0"
@REM  全局类JSON 文件数量
set /a "total_json=0"
@REM  nodeJS/TS类JSON 文件数量
set /a "js_json=0"

for /R "%~dp0snippets" %%i in ("*.json") do (
    set "file_name=%%~fi"
    if not "!file_name:全局=!"=="!file_name!" (
        set /a "total_json+=1"
    ) else if not "!file_name:nodeJS=!"=="!file_name!" (
        if not "!file_name:bat=!"=="!file_name!" (
            @REM  包含 bat 字符串的 JSON 文件
            set /a "count+=1"
        ) else (
            @REM  不包含 bat 字符串的 JSON 文件
            set /a "js_json+=1"
        )
    ) else (
        set /a "count+=1"
    )
)

ECHO ====================== 统计 ======================

ECHO.全局json文件数量: !total_json!
ECHO.nodeJS/TS json文件数量: !js_json!


@REM  每个 json 文件占用的行数倍数
set /a "base_mult=4"


@REM  需要重复计数的 json 文件数量
@REM  = 全局类JSON * total_mult + nodeJS/TS类JSON * ts_mult
set /a "total_mult=4"
set /a "ts_mult=2"
set /a "dup=total_json*total_mult+js_json*ts_mult"


@REM  忽略的 json 文件数量
set /a "ign=0"


@REM  开始行号
set /a "start_line=105"
@REM  结束补充行数
set /a "end_line=4"


@REM  计算结束行号
set /a "end_line=start_line+end_line+(count+dup-ign)*base_mult"


for /f %%a in ('find /c /v "" ^< "%~dp0package.json"') do set "raw=%%a"
set /a "total_lines=%raw:*: =%"
set /a "total_lines+=1"


ECHO.统计到的 json 文件数量: !count!
ECHO.统计到的 json 文件数量: !start_line! 到 !end_line!
ECHO.
ECHO.计算行数: !end_line!
ECHO.实际行数: !total_lines!



endlocal
@REM  renpy-syntaxes 更新地址 : https://github.com/renpy/vscode-language-renpy