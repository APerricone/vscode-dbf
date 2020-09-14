//const vscode = require('vscode');
const fs = require('fs');

/**
 * Harbour\include\hbdbf.h
 * @typedef {Object} dbfHeader
 * @property {Number} version
 * @property {Number} year
 * @property {Number} month
 * @property {Number} day
 * @property {Number} nRecord
 * @property {Number} headerLen
 * @property {Number} recordLen
 * @property {Number} transaction  1-transaction begin
 * @property {Number} encrypted 1-encrypted table
 * @property {Number} hasTags bit filed: 1-production index, 2-memo file in VFP
 * @property {Number} codePage
 */
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
        // eslint-disable-next-line no-unused-vars
        this.onRow = (row) => {};
        this.readHeader();
    }

    readHeader() {
        fs.open(this.uri.fsPath,'r', (err,fd)=>{
            fs.read(fd,Buffer.alloc(2),0,2,8,(err,nByte,hl)=>{
                var headerLen = hl.readUInt16LE(0);
                var buff = Buffer.alloc(headerLen);
                fs.read(fd,buff,0,headerLen,0,(err,nByte,buff)=>{
                    this.setInfo(buff);
                    fs.close(fd);
                });
            });
        });
    }

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
        this.colInfos = [];
        var nCol = (this.info.headerLen>>5)-1;
        for(var colId=0;colId<nCol;colId++) {
            /** @type {dbfColInfo} */
            var colInfo = {};
            var idx = 32+(colId<<5);
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
        var off = this.info.headerLen + this.info.recordLen * (start - 1)
        var recordBuff = Buffer.alloc(this.info.recordLen);
        var idx=start;
        fs.open(this.uri.fsPath,'r', (err,fd)=>{
            var cb = (err,nByte,buff)=>{
                this.evalRow(idx,buff);
                off+=this.info.recordLen;
                idx++;
                if(idx<=end)
                    fs.read(fd,recordBuff,0,this.info.recordLen,off,cb);
                else
                    fs.close(fd);
            };
            fs.read(fd,recordBuff,0,this.info.recordLen,off,cb);
        });
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
            var str = data.toString("ascii",off,off+col.len).replace(/\0+/,"");
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
                    val.setMilliseconds(data.readInt32LE(off));
                    ret.push(val);
                    break;
                case "@":
                    var val=new Date(0,0,0);
                    val.setDate(data.readInt32LE(off)-2414989)
                    val.setMilliseconds(data.readInt32LE(off+4));
                    ret.push(val);
                    break;
                default:
                    ret.push(col.type + "unsupported");
                    break;
            }
            off += col.len;
        }
        this.onRow(ret);
    }

}
exports.dbfDocument = dbfDocument;
