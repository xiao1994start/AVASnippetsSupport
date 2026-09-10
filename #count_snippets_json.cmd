@ECHO OFF
setlocal EnableDelayedExpansion
CD /D "%~dp0"


@REM  统计 snippets 目录下所有 json 文件的数量
set /a "count=0"

for /R "%~dp0snippets" %%i in ("*.json") do ( set /a "count+=1" )

ECHO 统计到的 json 文件数量: !count!

@REM  每个 json 文件占用的行数倍数
set /a "mult=4"
@REM  需要重复计数的 json 文件数量
set /a "dup=4"
@REM  忽略的 json 文件数量
set /a "ign=3"

@REM  开始行号
set /a "start_line=84"
@REM  结束补充行数
set /a "end_line=4"

@REM  计算结束行号
set /a "end_line=start_line+end_line+(count+dup-ign)*mult"

ECHO 统计到的 json 文件数量: !start_line! 到 !end_line!



endlocal
