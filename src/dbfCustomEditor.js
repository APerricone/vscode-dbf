const vscode = require('vscode');
const { dbfDocument } = require("./dbfDocument");
const path = require('path');
const fs = require('fs');


class dbfCustomEditor {

    /**
    * @param {vscode.ExtensionContext} context
     * @param {dbfDocument} document
     * @param {vscode.WebviewPanel} webviewPanel
    */
    constructor(context, document, webviewPanel) {
        this.context = context;
        this.document = document;
        this.webviewPanel = webviewPanel;
    }

    setup() {
        var src = path.join(this.context.extensionPath,"media","index.html");
        this.webviewPanel.webview.options= {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
        };
		// Receive message from the webview.
		this.webviewPanel.webview.onDidReceiveMessage((m) => {
            this.onMessage(m, this.document, this.webviewPanel);
		});
        return new Promise((resolve,reject) => {
            fs.readFile(src, {"encoding": "utf-8"}, (err,data) => {
                data = data.replace(/\$\{webview\.cspSource\}/g,this.webviewPanel.webview.cspSource)
                data = data.replace(/\$\{baseUri\}/g,this.webviewPanel.webview.asWebviewUri(
                    this.webviewPanel.webview.options.localResourceRoots[0]
                ))
                this.webviewPanel.webview.html = data;
                resolve();
                if(this.document.ready) {
                    this.fillWebPanel();
                } else
                    this.document.onReady = () => this.fillWebPanel();
            });
        });

    }

    onMessage(message) {
        switch (message.command) {
            case "ready":
                if(this.document.ready) {
                    this.fillWebPanel()
                } else
                    this.document.onReady = () => this.fillWebPanel();
                break;

            default:
                break;
        }
    }

    fillWebPanel() {
        if(!this.document.ready) {
            throw "document not ready"
        }
        // write header
        var headers = [];
        for (let i = 0; i < this.document.colInfos.length; i++) {
            const colInfo = this.document.colInfos[i];
            headers.push(colInfo.name);
        }
        this.webviewPanel.webview.postMessage({ command: 'header', data: headers });
        var dFormat = new Intl.DateTimeFormat(vscode.env.language, {dateStyle: "short"});
        var tFormat = new Intl.DateTimeFormat(vscode.env.language, {timeStyle: "short"});
        var dtFormat = new Intl.DateTimeFormat(vscode.env.language, {dateStyle: "short", timeStyle: "short"});
        // write rows
        this.document.onRow =(row) => {
            var rowInfo = [];
            for (let i = 0; i < row.length; i++) {
                /** @type {String|Number|Date|Boolean} */
                const val = row[i];
                /** @type {dbfDocument.dbfcolInfo} */
                const colInfo = this.document.colInfos[i];
                switch (colInfo.type) {
                    case "C":   rowInfo.push(val);                      break;
                    case "N":   rowInfo.push(val.toFixed(colInfo.dec)); break;
                    case "L":   rowInfo.push(val? "1" : "0");           break;
                    case "D":   rowInfo.push(dFormat.format(val));      break;
                    case "T":   rowInfo.push(tFormat.format(val));      break;
                    case "@":   rowInfo.push(dtFormat.format(val));     break;
                    default:    rowInfo.push(val + "?");                break;
                }

            }
            this.webviewPanel.webview.postMessage({ command: 'row', data: rowInfo, recno: row.recNo });
        }
        this.document.readRows(1,Math.min(10,this.document.info.nRecord));
    }
};

exports.dbfCustomEditor = dbfCustomEditor;