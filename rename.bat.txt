@echo off
setlocal enabledelayedexpansion

for %%F in (*.*) do (
    set "filename=%%F"
    set "newfilename=!filename: =_!"
    if not "!filename!"=="!newfilename!" ren "%%F" "!newfilename!"
)

echo All files renamed successfully!
echo use XL formula to replace in sheet =SUBSTITUTE(A1, " ", "_")

pause

