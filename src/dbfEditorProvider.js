const vscode = require('vscode');
const { dbfDocument } = require("./dbfDocument");
const { dbfCustomEditor } = require("./dbfCustomEditor");

/**
 *@extends vscode.CustomReadonlyEditorProvider
 */
class dbfEditorProvider
{
    /**
    * @param {vscode.ExtensionContext} context
    */
    constructor(context) {
        this.context = context;
    }
    /**
     *
     * @param {vscode.Uri} uri
     * @param {vscode.CustomDocumentOpenContext} openContext
     * @param {vscode.CancellationToken} token
     */
    openCustomDocument(uri, openContext, token) {
        if(uri.scheme != "file")
            return undefined;
        return new dbfDocument(uri);
    }
    /**
     *
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     * @param {vscode.CancellationToken} token
     */
    resolveCustomEditor(document, webviewPanel, token) {
        var dbfEditor = new dbfCustomEditor(this.context, document, webviewPanel);
        return dbfEditor.setup();
    }
}


exports.dbfEditorProvider = dbfEditorProvider;
