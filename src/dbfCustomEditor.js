const vscode = require('vscode');
//const { dbfDocument } = require("./dbfDocument");
const path = require('path');
const fs = require('fs');

var dbfCurrentEditor;
/**
 * @extends vscode.CustomReadonlyEditorProvider
 */
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

        this.webviewPanel.onDidChangeViewState((ev) => {
            this.changedViewState(ev);
        });
        dbfCurrentEditor = this;
    }

    /**
     * @returns {dbfCustomEditor}
     */
    static getCurrentEditor() {
        return dbfCurrentEditor;
    }

    /**
     *
     * @param {vscode.WebviewPanelOnDidChangeViewStateEvent} ev
     */
    changedViewState(/*ev*/) {
        if(this.webviewPanel.visible && dbfCurrentEditor != this) {
            dbfCurrentEditor = this;
            if(this.document.ready) {
                this.fillWebPanel();
            } else
                this.document.onReady = () => this.fillWebPanel();
        } else {
            if(dbfCurrentEditor==this)
                dbfCurrentEditor = undefined;
        }
    }

    setup() {
        var src = path.join(this.context.extensionPath,"media","index.html");
        this.webviewPanel.webview.options= {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
        };
		// Receive message from the webview.
        this.webviewPanel.webview.onDidReceiveMessage((m) => {
            this.onMessage(m);
        });

        // eslint-disable-next-line no-unused-vars
        return new Promise((resolve,reject) => {
            fs.readFile(src, {"encoding": "utf-8"}, (err,data) => {
                data = data.replace(/\$\{webview\.cspSource\}/g,this.webviewPanel.webview.cspSource)
                data = data.replace(/\$\{baseUri\}/g,this.webviewPanel.webview.asWebviewUri(
                    this.webviewPanel.webview.options.localResourceRoots[0]
                ))
                this.webviewPanel.webview.html = data;
                resolve();
            });
        });

    }

    onMessage(message) {
        switch (message.command) {
            case "ready":
                if(this.document.ready) {
                    this.fillWebPanel();
                } else
                    this.document.onReady = () => this.fillWebPanel();
                break;
            case "rows":
                this.document.readRows(message.min,Math.min(message.max,this.document.info.nRecord));
                break;
            default:
                break;
        }
    }

    fillWebPanel() {
        if(!this.document.ready) {
            throw "document not ready"
        }
        this.webviewPanel.webview.postMessage({ command: 'info', data: this.document.info, cols: this.document.colInfos });
        // write header
        var dateOpt = { year: "numeric", month: "2-digit", day: "2-digit"};
        var timeOpt = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false};
        var dFormat = new Intl.DateTimeFormat(vscode.env.language, dateOpt);
        var tFormat = new Intl.DateTimeFormat(vscode.env.language, timeOpt);
        var dtFormat = new Intl.DateTimeFormat(vscode.env.language, { ...dateOpt, ...timeOpt});
        // write rows
        this.document.onRow =(row) => {
            var rowInfo = [];
            for (let i = 0; i < row.length; i++) {
                /** @type {String|Number|Date|Boolean} */
                const val = row[i];
                /** @type {dbfcolInfo} */
                const col = this.document.colInfos[i];
                switch (col.type) {
                    case "C":
                    case "V":   rowInfo.push(val);                      break;
                    case "L":   rowInfo.push(val? "1" : "0");           break;
                    case "D":   rowInfo.push(dFormat.format(val));      break;
                    case "T":   if(col.len==4) { rowInfo.push(tFormat.format(val));      break;} //fallthrough
                    case "@":   rowInfo.push(dtFormat.format(val));     break;
                    case "I": case "Y": case "+": case "^": case "B": case "Z": case "F":
                    case "N":   rowInfo.push(val.toFixed(col.dec)); break;
                    case "V":
                        if(col.len==3)  { rowInfo.push(dFormat.format(val)); break; }
                        if(col.len==4)  { rowInfo.push(val.toFixed(col.dec)); break; }
                        //fallthrough
                    default:    rowInfo.push(val + "?");                break;
                }

            }
            this.webviewPanel.webview.postMessage({ command: 'row', data: rowInfo, recno: row.recNo, deleted: row.deleted });
        }
    }

    goto(val) {
        this.webviewPanel.webview.postMessage({ command: 'goto', data: val });
    }
};

exports.dbfCustomEditor = dbfCustomEditor;
