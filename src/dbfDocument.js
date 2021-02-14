const vscode = require('vscode');
const fs = require('fs');
const { type } = require('os');
const iconv = require('iconv-lite');
const SUPPORTED_ENCODINGS = require('./encoding').SUPPORTED_ENCODINGS;

/*
 * dbf columns types:
 * 'C' Character - String
 * 'Q' Variable len character - String
 * 'L' Logical - Boolean
 * 'D' Date
 * 'T' Time, if len is 4, datetime otherwide
 * '@' Date time
 * '=' Mod type
 * 'I' Integer
 * 'Y' Currency (fixed decimal)
 * '2' Integer len 2
 * '4' Integer len 4
 * '+' Auto increment (integer)
 * '^' auto increment Row ver (integer)
 * '8', 'B','Z' double
 * 'N' Number
 * 'F' float
 * 'V' Variable:
 *   len 3 - Date
 *   len 4 - Integer
 * 'M' Memo type - UNSUPPORTED
 * 'P' Picture - Image - UNSUPPORTED
 *
 * javascript type -> DBF types
 * String - 'C', 'Q',
 * Number - 'N', 'I', 'Y', '2', '4', '+', '^', '8', 'B', 'Z', 'V4'
 * Boolean - 'L'
 * Object Date - 'D', 'T', '@', '='
 */

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
 * @property {'C'|'N'|'L'|'D'|'T'|'@'} type
 * @property {Number} len
 * @property {Number} dec
 * @property {Number} flags
 * @property {Number} counter
 * @property {Number} step
 * @property {Number} tag
 * @property {Number} offset - calculated value of the offset of this column on buffer
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
        if (uri.scheme != "file") return;
        this.onReady = () => { };
        this.ready = false;
        // eslint-disable-next-line no-unused-vars
        this.onRow = (row) => { };
        /** index of sort column, or undefined if no sort info
         * @type {Number} */
        this.sortCol = undefined;
        /** @type {boolean} */
        this.sorted_desc = false;
        /** sorted recno, it is an array of length info.nRecord.
         * @type {Number[]}
        */
        this.sortedIdx = undefined; //
        this.sorting = undefined;
        this.onSort = () => {}
        var dateOpt = { year: "numeric", month: "2-digit", day: "2-digit"};
        var timeOpt = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false};
        var dFormat = new Intl.DateTimeFormat(vscode.env.language, dateOpt);
        var tFormat = new Intl.DateTimeFormat(vscode.env.language, timeOpt);
        var dtFormat = new Intl.DateTimeFormat(vscode.env.language, { ...dateOpt, ...timeOpt});
        this.formatters = [dFormat,tFormat,dtFormat];
        // Init
        this.readHeader();
        /**
         * @type {vscode.StatusBarItem}
         */
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
        this.iconvEncode = vscode.workspace.getConfiguration("dbf-table").get("encoding");
        if(this.iconvEncode.length==0)
            this.iconvEncode = vscode.workspace.getConfiguration("files").get("encoding");
        if(["utf8bom","utf16le","utf16be"].indexOf(this.iconvEncode)>=0 )
            this.iconvEncode = "utf8"
        this.statusBarItem.text = this.iconvEncode;
        if( this.statusBarItem.text in SUPPORTED_ENCODINGS) {
            this.statusBarItem.text = SUPPORTED_ENCODINGS[this.statusBarItem.text].labelShort;
        }
        this.statusBarItem.command = "vscode-dbf.change-encoding";
        this.statusBarItem.show()
    }
    dispose() {
        if(this.statusBarItem) {
            this.statusBarItem.dispose()
        }
    }

    readHeader() {
        fs.open(this.uri.fsPath, 'r', (err, fd) => {
            //if(err) throw err;
            fs.read(fd, Buffer.alloc(2), 0, 2, 8, (err, nByte, hl) => {
                var headerLen = hl.readUInt16LE(0);
                var buff = Buffer.alloc(headerLen);
                fs.read(fd, buff, 0, headerLen, 0, (err, nByte, buff) => {
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
        this.info.year = data.readUInt8(1);
        this.info.month = data.readUInt8(2);
        this.info.day = data.readUInt8(3);
        this.info.nRecord = data.readUInt32LE(4);
        this.info.headerLen = data.readUInt16LE(8);
        this.info.recordLen = data.readUInt16LE(10);
        //12 // spazio di 2
        this.info.transaction = data.readInt8(14);
        this.info.encrypted = data.readInt8(15);
        // 16 // spazio di 12
        this.info.hasTags = data.readInt8(28); //
        this.info.codePage = data.readInt8(29);
        // theoretically "codePage" should mean something...
        // 30 // spazio di 2
        this.readingRow=[];
        this.readingRow.length=this.info.nRecord+1;
        this.readingRow.fill(false);
        /** @type {dbfColInfo[]} */
        this.colInfos = [];
        var nCol = (this.info.headerLen >> 5) - 1;
        var off = 1;
        var vfp = this.info.version == 0x30 || this.info.version == 0x32;
        for (var colId = 0; colId < nCol; colId++) {
            /** @type {dbfColInfo} */
            var colInfo = {};
            var idx = 32 + (colId << 5);
            colInfo.name = data.toString("ascii", idx, idx + 10).replace(/\0+/, "");
            colInfo.type = String.fromCharCode(data.readUInt8(idx + 11));
            //12 // spazio di 4
            colInfo.len = data.readUInt8(idx + 16);
            colInfo.dec = data.readInt8(idx + 17);
            colInfo.flags = data.readInt8(idx + 18);
            colInfo.counter = data.readInt32LE(idx + 19);
            colInfo.step = data.readInt8(idx + 23);
            // 24 // spazio di 7
            colInfo.tag = data.readInt8(idx + 31);
            // calculated value
            colInfo.offset = off;
            off += colInfo.len;
            switch (colInfo.type) {
                case "C":
                    colInfo.len += colInfo.dec * 256;
                    off += colInfo.dec * 256;
                    break;
                case "2": case "4":
                    colInfo.len = colInfo.type == "2" ? 2 : 4;
                    colInfo.type = "I";
                    break;
                case "8":
                    colInfo.type = "B";
                    break;
                case "Q":
                    if (vfp) {
                        colInfo.type = "V";
                        colInfo.flags |= 0x4; // binary
                    }
                    break;
                case "V":
                    if (vfp) {
                        colInfo.type = "Q";
                        colInfo.flags &= ~0x4; // binary
                    }
                    break;
                case "\x1A": case "\x1B":
                    colInfo.type = colInfo.type == "\x1A" ? "C" : "Q";
                    colInfo.flags |= 0x40; // unicode 16
                    colInfo.len += colInfo.dec * 256;
                    //colInfo.len >>= 1;
                    break;
                case "\x1C":
                    colInfo.type = "M";
                    colInfo.flags |= 0x40; // unicode 16
                    break;
                case "0":
                    colInfo.flags |= 1; // hidden
                    continue;
            }
            if (colInfo.len != 0) {
                switch (colInfo.type) {
                    case "C": case "Q":
                        colInfo.baseType = "C"
                        break;
                    case "L":
                        colInfo.baseType = "L"
                        break;
                    case "D": case "T":
                    case "@": case "=":
                        colInfo.baseType = "D"
                        break;
                    case "I": case "Y": case "+": case "^":
                    case "B": case "Z":
                    case "N": case "F":
                        colInfo.baseType = "N"
                        break;
                    case "V":
                        switch (col.len) {
                            case 3:
                                colInfo.baseType = "D"
                                break;
                            case 4:
                                colInfo.baseType = "N"
                                break;
                            default:
                                colInfo.baseType = "U"
                                break;
                        }
                    default:
                        colInfo.baseType = "U"
                        break;
                }
                this.colInfos.push(colInfo);
            }
        }
        this.ready = true;
        this.onReady(this);
    }

    /**
     * Callback for readed row
     * @callback readBuffCallback
     * @param {Number} idx index of readed row
     * @param {Buff} data readed buffer
     * @param {Number} off start offset in data of row
     */

    /**
     * Internal method to read a group of rows
     * @param {Number} start start index of first row to read
     * @param {Number} end index of the last row to read
     * @param {readBuffCallback} cb Callback
     */
    readBuff(start,end,cb) {
        var readStart = this.info.headerLen + this.info.recordLen * (start - 1);
        var readEnd = this.info.headerLen + this.info.recordLen * end;
        var buffSize = this.info.recordLen*Math.ceil((64*1024)/this.info.recordLen);
        var rs = fs.createReadStream(this.uri.fsPath, {
            start:readStart,
            end:readEnd-1,
            highWaterMark: buffSize
        })
        //console.log(`asked ${start}-${end}`)
        rs.on("data",(data)=>{
            var readedEnd =  rs.start+rs.bytesRead;
            var readedStart =  readedEnd - data.length;
            var idx = Math.ceil((readedStart-this.info.headerLen)/this.info.recordLen);
            var pos = this.info.headerLen+idx*this.info.recordLen;
            idx+=1;
            var stopRead = Math.floor((readedEnd-this.info.headerLen)/this.info.recordLen);
            stopRead = this.info.headerLen + stopRead * this.info.recordLen;
            while(pos<stopRead) {
                //console.log(`readed idx ${idx}`)
                cb(idx,data,pos-readedStart)
                idx++;
                pos += this.info.recordLen;
            }
        });
        return rs;
    }

    /**
     * Internal method to read requested rows
     * @private
     */
    checkReadingBuff() {
        if(this.sorting) return;
        if(this.readingBuff) return;
        var readBuffCB = (idx,data,off)=>{
            if(!this.readingRow[idx]) return;
            this.readingRow[idx] = false;
            var ordNo = idx;
            if (this.sortedIdx)
                ordNo = this.sortedIdx.indexOf(idx)+1;
            var rowInfo = this.readRowFromBuffer(data, off);
            rowInfo.recNo = idx;
            rowInfo.ordNo = ordNo;
            this.onRow(rowInfo);
        };
        this.readingRow[0]=false;
        var readStart = this.readingRow.indexOf(true);
        if(readStart<0) return;
        var readEnd = this.readingRow.lastIndexOf(true);
        this.readingBuff = this.readBuff(readStart,readEnd,readBuffCB);
        this.readingBuff.on("close", () => {
            this.readingBuff=undefined
            this.checkReadingBuff()
        });
    }

    readRows(start, end) {
        if (this.sortedIdx) {
            for(let i=start;i<=end;++i) {
                this.readingRow[this.sortedIdx[i-1]] = true;
            }
        } else
            this.readingRow.fill(true,start,end+1)
        this.checkReadingBuff()
    }

    /**
     *
     * @param {Buffer} data
     * @param {Number} off
     * @param {dbfColInfo} col
     * @param {Boolean} cmpMode If true the value returned is readed faster and is easer to compare.
     * @note see hb_dbfGetValue from Harbour\src\rdd\dbf1.c
     */
    readValueFromBuffer(data, off, col, cmpMode) {
        var str;
        if (col.flags & 0x40)
            str = data.toString("utf16le", off, off + col.len/2);
        else {
            if(col.type=="C" || col.type=="Q")
                str = iconv.decode(data.subarray(off, off + col.len),this.iconvEncode);
            else
                str = data.toString("ascii", off, off + col.len);
            str = str.replace(/\0+/, "");
        }

        switch (col.type) {
            case "C":
                return str;
            case "Q":
                if (col.flags & 0x40) {
                    return str.substr(0, Math.min(data.readUInt16LE(off + col.len - 2), col.len));
                } else {
                    return str.substr(0, Math.min(data.readUInt8(off + col.len-1), col.len - 1));
                }
            case "L":
                return (str == 'T' || str == 't' || str == 'Y' || str == 'y');
            case "D":
                switch (col.len) {
                    case 3:
                        if (cmpMode) return (data.readInt24LE(off) & 0x0FFFFFF);
                        var val = new Date(Date.UTC(0, 0, 0)), v=data.readInt24LE(off);
                        if(v==0) return null;
                        val.setDate(v - 2414989)
                        return val;
                    case 4:
                        if (cmpMode) return (data.readInt32LE(off));
                        var val = new Date(Date.UTC(0, 0, 0)),v=data.readInt32LE(off);
                        if(v==0) return null;
                        val.setDate(v - 2414989)
                        return val;
                    default:
                        if (cmpMode) return str;
                        if(str[0]==" ") return null
                        var val = new Date(str.substr(0, 4)+"-"+str.substr(4, 2)+"-"+str.substr(6, 2));
                        //var val = new Date(Date.UTC(0,parseInt(str.substr(4, 2))-1,parseInt(str.substr(6, 2))));
                        //val.setUTCFullYear(parseInt(str.substr(0, 4)));
                        return val;
                }
                break;
            case "T":
                if (col.len == 4) {
                    if (cmpMode) return data.readInt32LE(off);
                    var val = new Date(Date.UTC(0,0,1)), v=data.readInt32LE(off);
                    //if(v==0) return null;
                    val.setFullYear(0);
                    val.setHours(0,0,0);
                    val.setMilliseconds(v);
                    return val;
                }
            // fallthrough
            case "@": case "=":
                if (cmpMode) return { days: data.readInt32LE(off), msec: data.readInt32LE(off + 4) };
                var val = new Date(Date.UTC(0, 0, 0)),v1=data.readInt32LE(off), v2=data.readInt32LE(off + 4);
                if(v1==0) return null;
                val.setUTCDate(v1 - 2414989)
                val.setHours(0,0,0);
                val.setMilliseconds(v2);
                return val;
            case "I": case "Y": case "+": case "^":
                var mul = 1;
                if (col.dec != 0)
                    var mul = 10 ** (-col.dec);
                switch (col.len) {
                    case 1:
                        return (data.readInt8(off) * mul);
                    case 2:
                        return (data.readInt16LE(off) * mul);
                    case 3:
                        return (data.readInt24LE(off) * mul);
                    case 4:
                        return (data.readInt32LE(off) * mul);
                    case 8:
                        // keep big int?
                        if(col.dec==0)
                            return (data.readBigInt64LE(off));
                        else
                            return (Number(data.readBigInt64LE(off)) * mul);
                    default:
                        return (NaN);
                }
            case "B": case "Z":
                return (data.readDoubleLE(off));
            case "N": case "F":
                if (str.trim().length == 0)
                    return (0);
                else
                    return (parseFloat(str));
            case "V":
                switch (col.len) {
                    case 3:
                        var val = data.readInt32LE(off) & 0xFFFFFF;
                        if (cmpMode) return val;
                        return (new Date(1900 + (val >> 9), (val >> 5) & 0xF, val & 0x1F));
                    case 4:
                        return (data.readInt32LE(off));
                    default:
                        return null;
                }
            case "M":
                return "<memo data>"
            default:
                if (cmpMode) return 0;
                return (col.type + "unsupported");
        }
    }

    /**
     *
     * @param {Buffer} data source buffer
     * @param {Number} [off] starting index for reading
     */
    readRowFromBuffer(data,off) {
        var ret = [];
        off = off | 0;
        ret.deleted = String.fromCharCode(data.readInt8(off)) == '*';
        off += 1;
        for (let i = 0; i < this.colInfos.length; i++) {
            const col = this.colInfos[i];
            ret.push(this.readValueFromBuffer(data, off, col));
            off += col.len;
        }
        return ret;
    }

    /**
     *
     * @param {dbfColInfo} col
     * @param {boolean} desc
     * @param {Intl.Collator} coll
     */
    getCmpFunc(col,desc,coll) {
        var v = desc? -1 : 1;
        switch (col.type) {
            case "C": case "Q":
                return (a, b) => v*coll.compare(a,b); //a[0] < b[0] ? -v : a[0] > b[0] ? v : 0;
            case "L":
                return (a, b) => a[0] == b[0] ? 0 : a[0] ? v : -v;
            case "D":
                if(col.len==3 || col.len==4)
                    return (a, b) => v * (a[0] - b[0]);
                else
                    return (a, b) => a[0] < b[0] ? -v : a[0] > b[0] ? v : 0;
            case "T":
                if(col.len==4) return (a, b) => v * (a[0] - b[0]);
                // fallthrough
            case "@": case "=": // {days, msec}
                return (a, b) => a[0].days != b[0].days ? v * (a[0].days - b[0].days) : v * (a[0].msec - b[0].msec);
            case "I": case "Y": case "+": case "^":
            case "B": case "Z": case "N": case "F":
            case "V":
                return (a, b) => v * (a[0] - b[0]);
            default:
                break;
        }
    }

    /**
     *
     * @param {*} val
     * @param {dbfColInfo|number} colInfo
     * @returns {string}
     */
    valToString(val, colInfo) {
        if(typeof(colInfo)=="number") colInfo = this.colInfos[colInfo];
        var [dFormat,tFormat,dtFormat] = this.formatters;
        switch (colInfo.type) {
            case "C":
            case "Q":   return val;
            case "L":   return val;
            case "D":
                if(val==null)
                    return dFormat.getEmpty()
                else
                    return dFormat.format(val);
            case "T":
                if(colInfo.len==4) {
                    //if(val==null)
                    //    return tFormat.formatToParts("").map((v)=>v.type=="literal"?v.value : " ".repeat(v.value.length)).join("")
                    //else
                        return tFormat.format(val);
                } //fallthrough
            case "=":
            case "@":
                if(val==null)
                    return dtFormat.getEmpty()
                else
                    return dtFormat.format(val);
            case "I": case "Y": case "+": case "^":
                if(typeof(val)=="bigint")
                    return (val.toString());
                else
                    return (val.toFixed(colInfo.dec));
            case "B": case "Z": case "F": case "N":
                return (val.toFixed(colInfo.dec));
            case "V":
                if(colInfo.len==3)  { return (dFormat.format(val)); }
                if(colInfo.len==4)  { return (val.toFixed(colInfo.dec)); }
                //fallthrough
        }
        return val + "?";
    }


    sort(colId, desc,filters) {
        this.readingRow.fill(false);
        // parameters validation
        if (typeof (colId) == "string") {
            var colname = colId;
            colId = this.colInfos.findIndex((v) => v.name == colname);
            if (codId < 0) throw colName + " not found";
        }
        if (typeof (colId) != "number") throw "invalid parameter";
        if(this.sorting)
            this.sorting.destroy();
        this.sorting = undefined;
        if(this.readingBuff)
            this.readingBuff.destroy();
        var hasFilter=false;
        var stringCompare = new Intl.Collator(vscode.env.language,{usage: "search", sensitivity:"base"})
        for(let f in filters) {
            var idx = parseInt(f);
            if(idx>=0 && idx<this.colInfos.length && f[0]>="0" && f[0]<="9") {
                switch (this.colInfos[idx].baseType) {
                    case "C":
                        if(filters[f].length>0) {
                            hasFilter=true;
                            filters[idx]=filters[idx].toLowerCase();
                        }
                        break;
                    case "N":
                        if(filters[f].length>0) {
                            hasFilter=true;
                            filters[idx]=parseFloat(filters[idx].replace(/,/g,"."))
                            var operator = "equal"
                            if(("operator-"+f) in filters) {
                                operator = filters["operator-"+f]
                            }
                            switch(operator) {
                                case "not-equal":
                                    filters["operator-"+f] = (a,b) => a!=b;
                                    break;
                                case "greater":
                                    filters["operator-"+f] = (a,b) => a>b;
                                    break;
                                case "less":
                                    filters["operator-"+f] = (a,b) => a<b;
                                    break;
                                case "greater-than-equal":
                                    filters["operator-"+f] = (a,b) => a>=b;
                                    break;
                                case "less-than-equal":
                                    filters["operator-"+f] = (a,b) => a<=b;
                                    break;
                                case "equal":
                                default:
                                    filters["operator-"+f] = (a,b) => a==b;
                                    break;
                            }

                        }
                        break;
                    case "L":
                        if(typeof(filters[f])=="boolean") {
                            hasFilter=true;
                        }
                        break;
                    default:
                        if(typeof(filters[f])=="string") {
                            hasFilter=true;
                        }
                        break;
                }
            }
        }
        if(colId<0) colId=undefined;
        if (!colId && !hasFilter) {
            this.sortCol = undefined;
            this.sortedIdx = undefined;
            this.onSort();
            this.checkReadingBuff()
            return;
        }
        this.sortCol = colId;
        this.sorted_desc = Boolean(desc);
        // read values
        var sortColInfo = colId? this.colInfos[colId] : undefined;
        var colData = Array(this.info.nRecord);
        var nRow = 0;
        var oldTime = Date.now()
        //console.log("inizio sorting")
        this.sorting = this.readBuff(1,this.info.nRecord,(idx,data,off)=>{
            var rowOK = true;
            if(hasFilter) {
                var rowInfo = this.readRowFromBuffer(data, off);
                for(let f in filters) {
                    var fIdx = parseInt(f);
                    if(fIdx>=0 && fIdx<this.colInfos.length) {
                        switch (typeof(rowInfo[fIdx])) {
                            case "string":
                                if(typeof(filters[f])=="string" && filters[f].length>0) {
                                    //rowOK = rowOK && (stringCompare.compare(rowInfo[f],filters[f])==0);
                                    rowOK = rowOK && (rowInfo[f].toLowerCase().indexOf(filters[f])>=0);
                                }
                                break;
                            case "number":
                                if(typeof(filters[f])=="number") {
                                    rowOK = rowOK && filters["operator-"+f](rowInfo[f], filters[f])
                                }
                                break;
                            case "boolean":
                                if(typeof(filters[f])=="boolean")
                                    rowOK = rowOK && (rowInfo[f] == filters[f]);
                                break;
                            default:
                                if(typeof(filters[f])=="string" && filters[f].length>0) {
                                    rowOK = rowOK && (this.valToString(rowInfo[f],fIdx).indexOf(filters[f])>=0);
                                }
                        }
                    }

                }
            }
            if(rowOK) {
                colData[nRow] = [sortColInfo? this.readValueFromBuffer(data, off+sortColInfo.offset, sortColInfo, true) : undefined, idx];
                nRow++;
            }
        });
        this.sorting.on("close",()=>{
            //console.log(`${Date.now()-oldTime} fine lettura`);
            oldTime = Date.now();
            colData.length = nRow;
            if(sortColInfo) {
                var sortFn = this.getCmpFunc(sortColInfo,this.sorted_desc,stringCompare);
                colData.sort(sortFn);
            }
            this.sortedIdx = colData.map((v)=>v[1]);
            //console.log(`${Date.now()-oldTime} fine sort`);
            var tmp = this.readingRow.slice();
            this.readingRow.fill(false);
            for(let i=0;i<tmp.length;i++)
                if(tmp[i])
                    this.readingRow[this.sortedIdx[i-1]]=true;
            this.sorting = undefined;
            this.onSort();
            this.checkReadingBuff()
        });
    }

    getListElement(colId, baseVal, cb) {
        if(this.currListStream!=undefined)
            this.currListStream.destroy();
        var maxItems=  vscode.workspace.getConfiguration("dbf-table").get("max-dropdown-values");
        if(this.currListCol==colId) {
            var param = [];
            if(baseVal.length==0) {
                if(this.currListItems.length<=maxItems)
                    cb(this.currListItems);
                else
                    cb();
                return;
            }
            baseVal = baseVal.toLowerCase();
            for (let i = 0; i < this.currListItems.length; i++) {
                const value = this.currListItems[i];
                if(value.toLowerCase().indexOf(baseVal)>=0)
                    param.push(value)
            }
            if(param.length<=maxItems)
                cb(param);
            else
                cb();
            return;
        }
        var items = {};
        var allItems = {};
        if(typeof(colId)!="number") {
            cb();
            return;
        }
        var sortColInfo = this.colInfos[colId];
        baseVal = baseVal.toLowerCase();
        this.currListStream = this.readBuff(1,this.info.nRecord,(idx,data,off)=>{
            var value = this.readValueFromBuffer(data, off+sortColInfo.offset, sortColInfo, true).trim();
            allItems[value]=true;
            if(baseVal.length==0 || value.toLowerCase().indexOf(baseVal)>=0)
                items[value]=true;
        });
        this.currListStream.on("close",()=>{
            this.currListStream = undefined;
            this.currListCol = colId;
            this.currListItems = Object.keys(allItems);
            this.currListItems.sort();
            var param = Object.keys(items);
            if(param.length>maxItems)
                param=undefined;
            else
                param.sort();
            cb(param);
        });
    }
}
exports.dbfDocument = dbfDocument;

Buffer.prototype.readInt24LE = function(off) {
    var tmp = Buffer.alloc(4);
    this.copy(tmp,0,off,off+3);
    if(tmp.readUInt8(2)&0x80) tmp.writeUInt8(0xFF,3);
    return tmp.readInt32LE();
}

Intl.DateTimeFormat.prototype.getEmpty = function() {
    return this.formatToParts("").map((v)=>v.type=="literal"?v.value : " ".repeat(v.value.length)).join("")
}