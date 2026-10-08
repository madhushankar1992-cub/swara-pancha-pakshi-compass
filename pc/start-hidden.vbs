' Starts the Pakshi Compass pop-up service without a console window.
' If it is already running, the new copy exits at once.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run """C:\Program Files\nodejs\node.exe"" """ & dir & "\daemon.js""", 0, False
