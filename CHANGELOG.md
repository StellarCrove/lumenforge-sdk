# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE` (MIT).

## [0.1.0] - 2026-08-10

### Added

- `LumenVaultClient`: read `balance()`, build `deposit`/`withdraw`
  operations against a deployed `lumen_vault` Soroban contract.
- Unit tests for client construction and operation building.
- CI workflow (build + test on push/PR to `main`).
