const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { dbfDocument } = require("./dbfDocument");

/**
 *@extends vscodde.CustomReadonlyEditorProvider
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
        // fill webpanel with document info
        var src = path.join(this.context.extensionPath,"media","index.html");
        webviewPanel.webview.options= {
            enableScripts: true
        };
		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage((m) => {
            this.onMessage(m, document, webviewPanel);
		});
        return new Promise((resolve,reject) => {
            fs.readFile(src, {"encoding": "utf-8"}, (err,data) => {
                webviewPanel.webview.html = data;
                resolve();
                if(document.ready) {
                    this.fillWebPanel(document,webviewPanel)
                } else
                    document.onReady = () => this.fillWebPanel(document,webviewPanel);
            });
        });
    }

    onMessage(message, document, webviewPanel) {
        switch (message.command) {
            case "ready":
                if(document.ready) {
                    this.fillWebPanel(document,webviewPanel)
                } else
                    document.onReady = () => this.fillWebPanel(document,webviewPanel);
                break;

            default:
                break;
        }
    }

    /**
     *
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
     */
    fillWebPanel(document, webviewPanel) {
        if(!document.ready) {
            throw "document not ready"
        }
        var headers = [];
        for (let i = 0; i < document.colInfos.length; i++) {
            const colInfo = document.colInfos[i];
            headers.push(colInfo.name);
        }
        webviewPanel.webview.postMessage({ command: 'header', data: headers });
    }
}


exports.dbfEditorProvider = dbfEditorProvider;