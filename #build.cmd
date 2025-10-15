@ECHO OFF
setlocal enabledelayedexpansion
CD /D "%~dp0"
for %%v in ("AVASnippetsSupport*.vsix") do (
    ECHO ����ɰ��� %%v
    del /F /Q "%%v"
)

CD /D "%~dp0..\..\env"
@REM ECHO %CD%

@REM ��׼���ļ���
if exist "%cd%\*node*" (
    for /D %%i in ("*node*") do (
        ECHO %%~fi
        if not "%%i"=="node" (
            ren "%%~fi" "node"
        )
    )
)
@REM ���û�������
set "sysPath=%path%"
@REM set "sysPath=C:\Program Files (x86)\Common Files\Intel\Shared Libraries\bin32;C:\Program Files (x86)\Common Files\Intel\Shared Libraries\bin;C:\WINDOWS;C:\WINDOWS\system32;C:\WINDOWS\System32\Wbem;C:\WINDOWS\System32\WindowsPowerShell\v1.0\;C:\WINDOWS\System32\OpenSSH\"
@REM ECHO �����ʱϵͳ��������
set "NODE_HOME=%cd%\node;%cd%\node\node_modules;"
set path=%NODE_HOME%;%sysPath%;
@REM ECHO %path%
@REM ��������
ECHO ���� npm
call npm i --global npm --registry https://registry.npmmirror.com/
@ECHO Node.js �汾��:
call node -v
@ECHO NPM �汾��:
call npm -v
@ECHO ��� ����ֿ�λ��:
call npm root -g

ECHO ��װ - ���� �Զ������ر���
ECHO ���ڰ�װ @vscode/vsce ����� (ʹ��Yeoman���д���:https://code.visualstudio.com/api/get-started/your-first-extension)
call npm install --global @vscode/vsce --registry https://registry.npmmirror.com/
ECHO ���ڰ�װ yo generate-code ��
call npm install --global yo generator-code --registry https://registry.npmmirror.com/
ECHO ��װ - ���� ��� & ECHO.

CD /D "%~dp0"
call vsce package
ECHO ��װ���
for %%i in (*.vsix) do (
    ECHO ����: %%i
    call code --install-extension %%i
    del /F /Q "..\%%i"
    copy /V /Y "%%i" "..\%%i"
)
ECHO �����װ�ű�ִ�����
@REM PAUSE > NUL
@REM timeout /T 1
