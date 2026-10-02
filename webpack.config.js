const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
	mode: 'production',
	entry: {
		settings: './src/settings/settings.js',
	},
	output: {
		filename: '[name]/[name].bundle.js',
		path: path.resolve(__dirname, 'build/webpack'),
		clean: true,
		publicPath: '/',
	},
	// Firefox provides globalThis; avoid webpack's Function-based Node global shim.
	node: {
		global: false,
	},
	module: {
		rules: [
			{
				test: require.resolve('@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'),
				loader: path.resolve(__dirname, 'vue-static-content-loader.cjs'),
			},
			{
				test: /\.vue$/,
				loader: 'vue-loader',
			},
			{
				test: /\.scss$/,
				use: ['style-loader', 'css-loader', 'sass-loader'],
			},
		],
	},
	plugins: [
		new HtmlWebpackPlugin({
			filename: 'settings/settings.html',
			template: 'src/settings/settings.html',
		}),
		new VueLoaderPlugin(),
		new CopyPlugin({
			patterns: [
				{ from: 'src/background', to: 'background' },
				{ from: 'src/extension' },
			],
		}),
	],
	watchOptions: {
		ignored: /node_modules/,
	},
}
