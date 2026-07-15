const globals = require("globals");

module.exports = [
	{
		ignores: [".vscode-test/**", "node_modules/**"]
	},
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "commonjs",
			globals: {
				...globals.node,
				...globals.mocha
			}
		},
		rules: {
			"no-const-assign": "warn",
			"no-this-before-super": "warn",
			"no-undef": "warn",
			"no-unreachable": "warn",
			"no-unused-vars": "warn",
			"constructor-super": "warn",
			"valid-typeof": "warn"
		}
	},
	{
		files: ["media/**/*.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
				acquireVsCodeApi: "readonly"
			}
		}
	}
];
