# Container Manager
A Firefox extension for opening matching URLs in specific containers and assigning proxies to individual containers.

URL rules can be configured using plain-text patterns. When a matching URL is opened outside a container, the extension automatically reopens it in the assigned Firefox container.

Each container can also have its own proxy configuration. HTTP, HTTPS, SOCKS4, and SOCKS5 proxies are supported, including authentication where applicable. Proxy settings can be enabled or disabled independently for each container.

## Building
To install dependencies, build the extension, and create a packaged add-on:
```sh
yarn install
yarn build
```
The webpack output is written to `build/webpack`, and the packaged extension is written to `web-ext-artifacts`.

## Original projects
This add-on combines the functionality of:
- [open-urls-in-container](https://github.com/ergolyam/open-urls-in-container)
- [pin-proxy-for-container](https://github.com/ergolyam/pin-proxy-for-container)
