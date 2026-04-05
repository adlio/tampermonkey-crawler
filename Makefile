.PHONY: all build clean dev-server install

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

clean:
	rm -rf node_modules package-lock.json
	rm -rf server/node_modules server/dist
	rm -rf tampermonkey/node_modules tampermonkey/dist
