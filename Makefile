# Packaging entry points. Everything that is not about producing an installer
# is a script in package.json and only wrapped here so `make help` lists it.
#
#   make dmg          a .dmg for this machine's architecture
#   make help         everything else

SHELL := /bin/bash

BUILDER := $(CURDIR)/node_modules/.bin/electron-builder
RELEASE := release

# uname's names are not electron-builder's names.
HOST_ARCH := $(shell uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/')
ARCH ?= $(HOST_ARCH)

# Unsigned by default: a local build should not fail because there is no
# Developer ID in the keychain — electron-builder falls back to an ad-hoc
# signature, which is enough to run the app on the machine that built it.
# `make dmg SIGN=1` opts back in to the real identity.
SIGN ?= 0
ifeq ($(SIGN),1)
  export CSC_IDENTITY_AUTO_DISCOVERY = true
else
  export CSC_IDENTITY_AUTO_DISCOVERY = false
endif

.DEFAULT_GOAL := help
.PHONY: help install dev build dmg dmg-universal app win linux open-release clean clean-release lint typecheck test check

help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	bun install

dev: ## Run the app against Vite
	bun run dev

build: ## Bundle the main process and the renderer (no installer)
	bun run build

dmg: build ## Build a .dmg for this machine (ARCH=arm64|x64, SIGN=1 to code sign)
	$(BUILDER) --mac dmg --$(ARCH)

dmg-universal: build ## Build one .dmg carrying both architectures
	$(BUILDER) --mac dmg --universal

app: build ## Build the unpacked .app only — faster than a .dmg for a smoke test
	$(BUILDER) --mac --dir --$(ARCH)

win: build ## Build a Windows installer (NSIS)
	$(BUILDER) --win nsis --$(ARCH)

linux: build ## Build a Linux AppImage
	$(BUILDER) --linux AppImage --$(ARCH)

open-release: ## Reveal the built artifacts
	open $(RELEASE) 2>/dev/null || xdg-open $(RELEASE) 2>/dev/null || explorer $(RELEASE)

lint: ## Lint the app
	bun run lint

typecheck: ## Typecheck the app
	bun run typecheck

test: ## Run the tests
	bun run test

check: ## Everything CI runs
	bun run format:check && bun run lint && bun run typecheck && bun run test

clean-release: ## Remove built installers
	rm -rf $(RELEASE)

clean: clean-release ## Remove installers and build output
	rm -rf dist-electron dist-renderer
