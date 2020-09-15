// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { dbfEditorProvider } = require("./dbfEditorProvider");
const { dbfCustomEditor } = require("./dbfCustomEditor");
const { dbfDocument } = require("./dbfDocument");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	let disposable = vscode.commands.registerCommand('vscode-dbf.goto', function () {
		/** @type {dbfCustomEditor} */
		var editor = dbfCustomEditor.getCurrentEditor();

		vscode.window.showInputBox({
			"prompt": `Type a record number between 1 and ${editor.document.info.nRecord}`,
			"valueSelection": [1,editor.document.info.nRecord+1]
		}).then((val)=>{
			if(typeof(val)=="string") val=parseInt(val);
			if(typeof(val)=="number") editor.goto(val);

		})
	});
	context.subscriptions.push(disposable);

	vscode.window.registerCustomEditorProvider("dbf-table",new dbfEditorProvider(context))
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
