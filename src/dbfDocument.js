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
        this.onReady = () => {};
        this.ready = false;
        this.onRow = (id,row) => {};
        this.info = {};
        fs.open(uri.fsPath,'r', (err,fd)=>{
            this.fd = fd;
            var buff = Buffer.alloc(32);
            fs.read(this.fd,buff,0,32,0,(err,nByte,buff)=>{
                this.setInfo(buff);
            })
        })
    }

    /**
     * Harbour\include\hbdbf.h
     * @typedef {Object} dbfHeader
     * @property {Number} version
     * @property {Number} year
     * @property {Number} month
     * @property {Number} day
     * @property {Date} readerUltimaModifica
     * @property {Number} nRecord
     * @property {Number} headerLen
     * @property {Number} recordLen
     * @property {Number} transaction  1-transaction begin
     * @property {Number} encrypted 1-encrypted table
     * @property {Number} hasTags bit filed: 1-production index, 2-memo file in VFP
     * @property {Number} codePage
     */
    /**
     *  @param {Buffer} data
     */
    setInfo(data) {
        /** @type {dbfHeader} */
        this.info = {};
        this.info.version = data.readInt8(0);
        this.info.year =  data.readInt8(1);
        this.info.month =  data.readInt8(2);
        this.info.day =  data.readInt8(3);
        this.info.readerUltimaModifica = new Date(1900 + this.info.year, this.info.month-1, this.info.day)
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
        var buff = Buffer.alloc(this.info.headerLen-32);
        fs.read(this.fd,buff,0,this.info.headerLen-32,32,(err,nByte,buff)=>{
            this.setColInfo(buff);
        })
    }

    /**
     *
     * @typedef {Object} dbfColInfo
     * @property {String} name
     * @property {String} type
     * @property {Number} len
     * @property {Number} dec
     * @property {Number} flags
     * @property {Number} counter
     * @property {Number} step
     * @property {Number} tag
     */
    /**
     *  @param {Buffer} data
     */
    setColInfo(data) {
        /** @type {Array<dbfColInfo>} */
        this.colInfos = [];
        var nCol = (this.info.headerLen>>5)-1;
        for(var colId=0;colId<nCol;colId++) {
            /** @type {dbfColInfo} */
            var colInfo = {};
            var idx = colId<<5;
            colInfo.name = data.toString("ascii",idx,idx+10).replace(/\0+/,"");
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
        this.onReady(this);
    }


    readRows(start,end) {
        var off = this.info.headerLen + (this.info.recordLen-1) * (start - 1)
        var recordBuff = Buffer.alloc(this.info.recordLen);
        var idx=start;
        var cb = (err,nByte,buff)=>{
            this.evalRow(idx,buff);
            off+=this.info.recordLen-1;
            idx++;
            if(idx<end) {
                fs.read(this.fd,recordBuff,0,this.info.recordLen,off,cb);
            }
        };
        fs.read(this.fd,recordBuff,0,this.info.recordLen,off,cb);
    }

    /**
     *
     * @param {Number} idx
     * @param {Buffer} data
     */
    evalRow(idx,data) {
        var ret = [];
        ret.recNo = idx;
        ret.deleted = String.fromCharCode(data.readInt8(0)) == '*';
        var off = 1;
        for (let i = 0; i < this.colInfos.length; i++) {
            const col = this.colInfos[i];
            var str = data.toString("ascii",idx,idx+col.len).replace(/\0+/,"");
            switch (col.type) {
                case "C":
                    ret.push(str);
                    break;
                case "N":
                    ret.push(parseFloat(str));
                    break;
                case "L":
                    ret.push(str =='T');
                    break;
                case "D":
                    ret.push(new Date(str.substr(0,4),str.substr(4,2)-1,str.substr(6,2)));
                    break;
                case "T":
                    if((col.flags & 4) == 0)
                        throw "da fare";
                    var val = new Date(0,0,1);
                    val.setFullYear(0);
                    val.setMilliseconds(data.readInt32LE(idx));
                    ret.push(val.toTimeString());
                    break;
                case "@":
                    var val=new Date(0,0,0);
                    val.setDate(data.readInt32LE(idx)-2414989)
                    val.setMilliseconds(data.readInt32LE(idx+4));
                    ret.push(val);
                    break;
                default:
                    ret.push(col.type + "unsupported");
                    break;
            }
            idx+= col.len;
        }
        this.onRow(idx,ret);
    }

}
exports.dbfDocument = dbfDocument;
