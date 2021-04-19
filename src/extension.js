// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { dbfEditorProvider } = require("./dbfEditorProvider");
const { dbfCustomEditor } = require("./dbfCustomEditor");
const { dbfDocument } = require("./dbfDocument");
const SUPPORTED_ENCODINGS = require('./encoding').SUPPORTED_ENCODINGS;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	vscode.commands.executeCommand('setContext', "vscode-dbf.hasDoc", false);
	context.subscriptions.push(vscode.commands.registerCommand('vscode-dbf.goto', goto));
	context.subscriptions.push(vscode.commands.registerCommand('vscode-dbf.change-encoding', changeEncoding));
	context.subscriptions.push(vscode.commands.registerCommand('vscode-dbf.make-code', createCode));

	vscode.window.registerCustomEditorProvider("dbf-table",new dbfEditorProvider(context))
}
exports.activate = activate;


function getEditor() {
	var editor = dbfCustomEditor.getCurrentEditor();
	if(!editor) {
		vscode.window.showInformationMessage('This command works only when a DBF is open.');
		return undefined;
	}
	return editor
}

function goto() {
	/** @type {dbfCustomEditor} */
	var editor = getEditor();
	if(!editor) return;
	vscode.window.showInputBox({
		"prompt": `Type a record number between 1 and ${editor.document.info.nRecord}`,
		"valueSelection": [1,editor.document.info.nRecord+1]
	}).then((val)=>{
		if(typeof(val)=="string") val=parseInt(val);
		if(typeof(val)=="number") editor.goto(val);

	})
}

function changeEncoding() {
	/** @type {dbfCustomEditor} */
	var editor = getEditor();
	if(!editor) return;
	let picker = vscode.window.createQuickPick()
	picker.items = Object.keys(SUPPORTED_ENCODINGS).map((v) => {return {
		"label": v,
		"description": SUPPORTED_ENCODINGS[v].labelLong
	}});
	picker.value = editor.document.iconvEncode
	picker.show()
	picker.onDidAccept(() => {
		const selected = picker.selectedItems
		if(selected.length>0)
			editor.setEncoding(selected[0].label)
		picker.hide();
	})
}

function createCode() {
	/** @type {dbfCustomEditor} */
	var editor = getEditor();
	if(!editor) return;
	vscode.workspace.openTextDocument({
		language: 'harbour',
		content: ""
	}).then(doc => {
		var eol = doc.eol==vscode.EndOfLine.LF?"\n":"\r\n";
		var aStruct = "aStruct";
		var type=0
		const options = ["one line","one line broken","multiple aAdd"]
		vscode.window.showTextDocument(doc).then(edit=> {
			var tab = edit.options.insertSpaces? " ".repeat(edit.options.tabSize) : "\t"
			function update(noSpace) {
				edit.edit((editBuilder)=>{
					editBuilder.replace(new vscode.Range(0,0,doc.lineCount,10000),
						(noSpace?"":eol.repeat(10))+editor.document.getCode(tab,eol,aStruct,type))
				})
			}
			vscode.window.showQuickPick(options,{
				"canPickMany": false,
				onDidSelectItem: (itm) => {
					type=options.indexOf(itm)
					update();
				}}).then((typeSelected)=>{
					type=options.indexOf(typeSelected)
					vscode.window.showInputBox({
						value: aStruct,
						prompt: "select variable name",
						validateInput: (vv) =>{
							aStruct = vv;
							update();
							return "";
						}
					}).then(()=>update(true))
				})
			});
	})
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
