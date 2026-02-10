ECHO OFF
setlocal enabledelayedexpansion
CD /D "%~dp0"
for %%v in ("AVASnippetsSupport*.vsix") do (
    ECHO 清理旧版插件 %%v
    del /F /Q "%%v"
)

CD /D "%~dp0..\"
@REM ECHO %CD%

@REM 标准化文件名
if exist "%CD%\*node-*" (
    for /D %%i in ("*node-*") do (
        ECHO %%~fi
        if not "%%i"=="node" (
            ren "%%~fi" "node"
        )
    )
)
@REM 设置环境变量
set "systemPath=%path%"
@REM set "systemPath=C:\Program Files (x86)\Common Files\Intel\Shared Libraries\bin32;C:\Program Files (x86)\Common Files\Intel\Shared Libraries\bin;C:\WINDOWS;C:\WINDOWS\system32;C:\WINDOWS\System32\Wbem;C:\WINDOWS\System32\WindowsPowerShell\v1.0\;C:\WINDOWS\System32\OpenSSH\"
@REM ECHO 添加临时系统环境变量
set "NODE_HOME=%CD%\node;%CD%\node\node_modules;"
set path=%NODE_HOME%;%systemPath%;
@REM ECHO %path%
@REM 环境测试
ECHO 升级 npm
call npm i --global npm --registry https://registry.npmmirror.com/
ECHO Node.js 版本号:
call node -v
ECHO NPM 版本号:
call npm -v
ECHO 检查 软件仓库位置:
call npm root -g

@REM ECHO 安装 - 更新 自定义插件必备库
@REM ECHO 正在安装 @vscode/vsce 打包库 (使用Yeoman进行创建:https://code.visualstudio.com/api/get-started/your-first-extension)
@REM call npm install --global @vscode/vsce --registry https://registry.npmmirror.com/
@REM ECHO 正在安装 yo generate-code 库
@REM call npm install --global yo generator-code --registry https://registry.npmmirror.com/

ECHO 安装 - 更新 完成 & ECHO.

CD /D "%~dp0"
call vsce package
ECHO 封装完成
for %%i in (*.vsix) do (
    ECHO 更新: %%i
    call code --install-extension %%i
    del /F /Q "..\%%i"
    copy /V /Y "%%i" "..\%%i"
)
ECHO 插件封装脚本执行完毕
@REM PAUSE > NUL
timeout /T 1