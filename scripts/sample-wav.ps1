# Speaks a public-domain passage (Treasure Island, R. L. Stevenson, 1883; Project Gutenberg #120) into a 16 kHz mono
# WAV with Windows' built-in voice, so the live pipeline can be tested without anyone's real recording.
# The sample-2/-3 passages, from the same chapter, are the answers to the later questions in a recorded run:
#   scripts/sample-wav.ps1 -In scripts/sample-2.txt -Out runs/sample-2.wav
param([string]$Out = "$PSScriptRoot\..\runs\sample.wav", [string]$In = "$PSScriptRoot\sample.txt")
Add-Type -AssemblyName System.Speech
$text = Get-Content -Raw $In
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile((Resolve-Path -LiteralPath (Split-Path $Out)).Path + "\" + (Split-Path $Out -Leaf), $fmt)
$s.Rate = 0
$s.Speak($text)
$s.Dispose()
Write-Output "wrote $Out"
