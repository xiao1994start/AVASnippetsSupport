@ECHO OFF
setlocal enabledelayedexpansion
CD /D "%~dp0"


for %%v in ("AVASnippetsSupport*.vsix") do ( ECHO 清理旧版插件 %%v && del /F /Q "%%v" )

CD /D "%~dp0..\"

@REM 标准化文件名
if exist "%CD%\*node-*" ( for /D %%i in ("*node-*") do ( ECHO %%~fi && if not "%%i"=="node" ( ren "%%~fi" "node" ) ) )
ECHO 设置环境变量
set "PATH=%PATH:;C:\Program Files\Microsoft VS Code;=;%"
set "systemPATH=%PATH%"
ECHO 设置临时系统环境变量
set "NODE_HOME=%CD%\node;%CD%\node\node_modules;"
set "PATH=%NODE_HOME%;%systemPATH%;"

@REM  ECHO 环境测试
@REM  ECHO 升级 npm
@REM  call npm i npm -g --registry https://registry.npmmirror.com/
@REM  ECHO Node.js 版本号:
@REM  call node -v
@REM  ECHO npm 版本号:
@REM  call npm -v
@REM  ECHO 检查 软件仓库位置:
@REM  call npm root -g

@REM  ECHO 安装 - 更新 自定义插件必备库
@REM  ECHO 正在安装 @vscode/vsce 打包库 (使用Yeoman进行创建:https://code.visualstudio.com/api/get-started/your-first-extension)
@REM  call npm i @vscode/vsce -g --registry https://registry.npmmirror.com/
@REM  ECHO 正在安装 yo generate-code 库
@REM  call npm i yo generator-code -g --registry https://registry.npmmirror.com/
@REM  ECHO 安装 - 更新 完成

CD /D "%~dp0"
ECHO.生成 package.json 文件
call "%~dp0package.exe"

ECHO 封装插件
call vsce package
for %%i in ("*.vsix") do (
    ECHO 更新: %%i
    call code --install-extension "%%i" 
    @REM  del /F /Q "..\%%i"
    @REM  copy /V /Y "%%i" "..\%%i"
)


endlocal
