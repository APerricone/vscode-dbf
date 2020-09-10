const vscode = require('vscode');
const fs = require('fs');

/**
 * @extends vscode.CustomDocument
 */
class dbfDocument {
    /**
     *
     * @param {vscode.Uri} uri
     */
    constructor(uri) {
        this.uri = uri;
        if(uri.scheme != "file") return;
        this.info = {};
        var infoStream = fs.createReadStream(uri.fsPath, {start: 0, end: 32});
        infoStream.on("data",(data)=> this.setInfo(data) );
        this.onReady = undefined;
        this.ready = false;
    }

    on(what,how) {
        var dest;
        if(what=="ready") {
            dest = "onReady";
        }
        if(dest) {
            if(this[dest]) {
                if(!Array.isArray(this[dest]))
                    this[dest] = [this[dest]];
                this[dest].push(how);
            } else
                this[dest] = how;
        }
    }

    call(what) {
        var pars = Array.prototype.slice.call(arguments,1);
        if(what) {
            if(Array.isArray(what))
                array.forEach(element => {
                    element.apply(undefined,pars);
                });
            else
                what.apply(undefined,pars);
        }
    }

    /**
     *  @param {Buffer} data
     */
    setInfo(data) {
        this.info = {};
        this.info.version = data.readInt8(0);
        this.info.year =  data.readInt8(1);
        this.info.month =  data.readInt8(2);
        this.info.day =  data.readInt8(3);
        this.info.readerUltimaModifica = new Date(1900 + this.info.year, this.info.month, this.info.day)
        this.info.nRecord =  data.readUInt32LE(4);
        this.info.headerLen = data.readUInt16LE(8);
        this.info.recordLen = data.readUInt16LE(10);
        //12 // spazio di 2
        this.info.transaction =  data.readInt8(14);
        this.info.encrypted =  data.readInt8(15);
        // 16 // spazio di 12
        this.info.hasTags =  data.readInt8(28);
        this.info.codePage =  data.readInt8(29);
        // 30 // spazio di 2

        var colInfoStream = fs.createReadStream(this.uri.fsPath, {start: 32, end: this.info.headerLen-32});
        colInfoStream.on("data", (data) => this.setColInfo(data));
    }

    /**
     *  @param {Buffer} data
     */
    setColInfo(data) {
        this.colInfos = [];
        var nCol = (this.info.headerLen>>5)-2;
        for(var colId=0;colId<nCol;colId++) {
            var colInfo = {};
            var idx = colId<<5;
            colInfo.name = data.toString("ascii",idx,idx+10).trim();
            colInfo.type= String.fromCharCode(data.readUInt8(idx+11));
            //12 // spazio di 4
            colInfo.len = data.readInt8(idx+16);
            colInfo.dec = data.readInt8(idx+17);
            colInfo.flags = data.readInt8(idx+18);
            colInfo.counter = data.readInt32LE(idx+19);
            colInfo.step  = data.readInt8(idx+23);
            // 24 // spazio di 7
            colInfo.tag = data.readInt8(idx+31);
            this.colInfos.push(colInfo);
        }
        this.ready = true;
        this.call(this.onReady, this)
    }

}
exports.dbfDocument = dbfDocument;
