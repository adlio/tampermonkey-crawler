.PHONY: all build clean dev-server install test test-server test-tampermonkey lint format format-check ci

all: build

install:
	npm install

build: build-server build-tampermonkey

build-server:
	npm run build --workspace=server

build-tampermonkey:
	npm run build --workspace=tampermonkey

dev-server:
	npm run dev --workspace=server

test:
	npm test --workspaces --if-present

test-server:
	npm test --workspace=server

test-tampermonkey:
	npm test --workspace=tampermonkey

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

ci: format-check lint build test

clean:
	rm -rf node_modules package-lock.json
	rm -rf server/node_modules server/dist
	rm -rf tampermonkey/node_modules tampermonkey/dist
