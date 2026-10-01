const fs = require('fs')
const path = require('path')

const manifestPath = path.join(__dirname, 'src', 'extension', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const version = manifest.version || '0.0.0'

module.exports = {
	sourceDir: 'build/webpack',
	build: {
		overwriteDest: true,
		filename: `container_urls_and_proxies-${version}.xpi`,
	},
}

