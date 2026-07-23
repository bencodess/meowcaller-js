# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2025-07-22

### Added
- Outbound and inbound call signaling (ported from Go)
- DTLS relay transport via `node-datachannel`
- SRTP media pipeline
- Opus codec support via `libopus-wasm` (16 kHz mono, 60 ms frames)
- MLow codec stub (passthrough, awaiting WASM port)
- Call registry for tracking active sessions
- Audio adapters (`SourceFunc`, `SinkFunc`, `PCMStream`, file sources)
- Video support (`AnnexBRecorder`, `VideoSinkFunc`)
- Player for frame-by-frame audio playback
- TypeScript type declarations
- CI/CD with auto-publish on push
- Unit tests

[0.3.0]: https://github.com/bencodess/meowcaller-js/releases/tag/v0.3.0
