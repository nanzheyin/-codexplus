Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define ROOT "..\..\.."

Name "Codex Deck"
OutFile "${ROOT}\dist\windows\CodexDeck-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Codex Deck"
InstallDirRegKey HKCU "Software\CodexDeck" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'taskkill /IM codex-deck.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-deck-manager.exe /F'
  Pop $0
  Delete "$DESKTOP\Codex Deck 管理工具.lnk"
  Delete "$SMPROGRAMS\Codex Deck\Codex Deck 管理工具.lnk"

  File "${ROOT}\dist\windows\app\codex-deck.exe"
  Delete "$INSTDIR\codex-deck-manager.exe"

  CreateShortcut "$DESKTOP\Codex Deck.lnk" "$INSTDIR\codex-deck.exe" "" "$INSTDIR\codex-deck.exe"
  CreateDirectory "$SMPROGRAMS\Codex Deck"
  CreateShortcut "$SMPROGRAMS\Codex Deck\Codex Deck.lnk" "$INSTDIR\codex-deck.exe" "" "$INSTDIR\codex-deck.exe"
  CreateShortcut "$SMPROGRAMS\Codex Deck\卸载 Codex Deck.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\codex-deck.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\CodexDeck" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "DisplayName" "Codex Deck"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "Publisher" "nanzheyin"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "DisplayIcon" "$INSTDIR\codex-deck.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Classes\codexdeck" "" "URL:Codex Deck Import Protocol"
  WriteRegStr HKCU "Software\Classes\codexdeck" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\codexdeck\shell\open\command" "" '"$INSTDIR\codex-deck.exe" "%1"'
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /IM codex-deck.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-deck-manager.exe /F'
  Pop $0

  Delete "$DESKTOP\Codex Deck.lnk"
  Delete "$SMPROGRAMS\Codex Deck\Codex Deck.lnk"
  Delete "$SMPROGRAMS\Codex Deck\卸载 Codex Deck.lnk"
  RMDir "$SMPROGRAMS\Codex Deck"

  Delete "$INSTDIR\codex-deck.exe"
  Delete "$INSTDIR\codex-deck-manager.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Classes\codexdeck"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexDeck"
  DeleteRegKey HKCU "Software\CodexDeck"
SectionEnd
