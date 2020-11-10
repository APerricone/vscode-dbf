/* eslint-env browser */
const vscode = acquireVsCodeApi();

var dbfInfo, dbfCols, totalRows;
var selRow=1, selCol=1;

window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "info":
            dbfInfo = ev.data.data;
            dbfCols = ev.data.cols;
            info();
            break;
        case "row":
            row(ev.data.ordNo, ev.data.recNo, ev.data.data, ev.data.deleted)
            break;
        case "goto":
            goto(ev.data.data);
            break;
        case "totalRow":
            resize(ev.data.nFilteredRow)
        }
});

document.addEventListener('DOMContentLoaded', function(){
    vscode.postMessage({"command": "ready"});
}, false);


function info() {
    // set up information on right
    var dest = document.getElementById("info-cnt");
    var txt = "<h1>DBF Informations</h1>";
    txt+=`<p><b>version:</b> ${dbfInfo.version}</p>`
    var lastMod = new Date(dbfInfo.year+1900,dbfInfo.month,dbfInfo.day);
    var dateOpt = { year: "numeric", month: "2-digit", day: "2-digit"};
    var dFormat = new Intl.DateTimeFormat(navigator.language, dateOpt);
    txt+=`<p><b>last modified date:</b> ${dFormat.format(lastMod)}</p>`
    txt+=`<p><b># records:</b> ${dbfInfo.nRecord}</p>`
    txt+= "<h2>Columns</h2>";
    for (let i = 0; i < dbfCols.length; i++) {
        const colInfo = dbfCols[i];
        if(colInfo.baseType=="N")
            txt+=`<p><b class="nCol">${colInfo.name}</b>(${colInfo.type}:${colInfo.len}.${colInfo.dec})</p>`
        else
            txt+=`<p><b class="${colInfo.baseType.toLowerCase()}Col">${colInfo.name}</b>(${colInfo.type}:${colInfo.len})</p>`
    }
    dest.innerHTML = txt;
    // set up columns
    header(dbfCols);
    // setup  rows
    setupRows(dbfCols,dbfInfo);
    // setup scrolling
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.onscroll = onScroll;
    document.body.onkeydown = onKeyPress;
    window.onresize = onScroll;
    onScroll();
}

function header(colInfo) {
    var head = document.getElementsByTagName("thead")[0];
    if(head.children.length>0) return;
    var dest = document.createElement("tr");
    head.appendChild(dest);
    var filters = document.createElement("tr");
    head.appendChild(filters);

    var cell = document.createElement("th");
    cell.className = "noborder";
    dest.appendChild(cell);
    cell = document.createElement("th");
    cell.className = "noborder";
    filters.appendChild(cell);

    var row = [dest,filters];
    for (let id = 0; id < colInfo.length; id++) {
        for(let i=0;i<2;i++) {
            var cell = document.createElement("th");
            var w = colInfo[id].len;
            cell.style.overflow = "hidden";
            switch(colInfo[id].type) {
                case "D": w=10; break;
                case "T": w= 8; break;
                case "@": w=22; break;
            }
            if(colInfo[id].type=="L")
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = "18px";
            else
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = w+"ch";

            if(i==0) {
                cell.onclick=changeOrder;
                cell.title = colInfo[id].name;
                cell.textContent = colInfo[id].name;
             } else if(colInfo[id].type=="L") {
                cell.style.padding="0";
                var inp = document.createElement("div")
                inp.classList.add("codicon","checkbox","codicon-check-3rd-state");
                inp.style.cursor = "pointer";
                inp.addEventListener("click",checkBoxEvt)
                cell.appendChild(inp);
             } else {
                cell.style.padding="0";
                var inp = document.createElement("input")
                inp.addEventListener("keyup",addFilter)
                cell.appendChild(inp);
            }
            row[i].appendChild(cell);
        }
    }
}

function setupRows() {
    var body = document.getElementsByTagName("tbody")[0];
    body.innerHTML="";
    var h1 = screen.height //document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    totalRows = Math.floor(h1/h2)-1;
    document.getElementById("empty-scroll").style.height = (h2*(dbfInfo.nRecord+2)).toFixed(0)+"px";
    for(let i=0;i<totalRows;i++) {
        var dest = document.createElement("tr");
        dest.id = "row"+(i+1);
        dest.className="empty";
        var cell = document.createElement("td");
        cell.textContent = (i+1)+"";
        cell.style.textAlign = "right"
        dest.appendChild(cell);
        cell = document.createElement("td");
        cell.colSpan = dbfCols.length;
        cell.className = "loading";
        dest.appendChild(cell);
        for (let id = 0; id < dbfCols.length; id++) {
            /** @type {HTMLElement} */
            var cell = document.createElement("td");
            switch(dbfCols[id].type) {
                case "C":
                    cell.className = "cCol";
                    break;
                case "N":
                    cell.style.textAlign = "right"
                    cell.className = "nCol";
                    break;
                case "L":
                    cell.className = "lCol";
                    break;
                }
            dest.appendChild(cell);
        }
        body.appendChild(dest);
    }
    h1=document.getElementsByTagName("body")[0].clientHeight

    var n = Math.floor(h1/h2)-1;
    console.debug("ask rows 1-"+n)
    vscode.postMessage({"command": "rows", "min":1, "max": n});
}

function row(idx,recNo,data,deleted) {
    console.debug("<row-" + idx + "-" + recNo)
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var id = idx-firstPos;
    var dest = document.getElementById("row"+(id));
    if(!dest) return;
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if(deleted) {
        dest.classList.add("deleted");
    } else {
        dest.classList.remove("deleted");
    }
    dest.children[0].textContent = recNo+"";
    for (let id = 0; id < data.length; id++) {
        if(idx==selRow && (id+1)==selCol) {
            dest.children[id+2].classList.add("selected");
        } else
            dest.children[id+2].classList.remove("selected");
        if(dbfCols[id].type=="L") {
            var html = '<div class="codicon checkbox'
            if(data[id]) html+=" codicon-check"
            html+='"></div>'
            dest.children[id+2].innerHTML=html
        } else
            dest.children[id+2].textContent = data[id];
    }
}

function copyRow(destId, srcId) {
    var dest = document.getElementById("row"+(destId+1));
    var src = document.getElementById("row"+(srcId+1));
    if((!dest) || (!src)) return;
    if(src.classList.contains("empty")) {
        dest.classList.add("empty");
        dest.classList.remove("filled");
        return;
    }
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if(src.classList.contains("deleted")) {
        dest.classList.add("deleted");
    } else {
        dest.classList.remove("deleted");
    }
    for (let id = 0; id < dest.children.length; id++) {
        dest.children[id].textContent = src.children[id].textContent;
    }
}

var lastTop = -10000;
function onScroll() {
    var tableCnt = document.getElementById("table-cnt");
    //if(tableCnt.scrollTop==lastTop)
    //    return;
    var h1 = document.body.clientHeight
    var h2 = document.getElementById("row1").clientHeight;
    var nRows = Math.floor(h1/h2)-1;

    var maxTop = ((dbfInfo.nRecord+3)*h2)-h1;
    tableCnt.children[0].style.top=Math.max(0,Math.min(maxTop,tableCnt.scrollTop))+"px";

    // hide and show rows based on current height
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var minEmpty = dbfInfo.nRecord, maxEmpty = 0;
    for(let i=0;i<totalRows;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest) {
            var n = (i+1+firstPos);
            if(n>dbfInfo.nRecord || i>=nRows) {
                dest.style.display = "none";
                dest.classList.add("empty");
                dest.classList.remove("filled");
            } else {
                dest.style.display = "table-row";
                if(dest.classList.contains("empty")) {
                    if(n<minEmpty) minEmpty=n;
                    if(n>maxEmpty) maxEmpty=n;
                }
            }
        }
    }
    if(minEmpty<=maxEmpty) {
        console.debug("ask rows "+minEmpty+"-"+maxEmpty)
        vscode.postMessage({"command": "rows", "min":minEmpty, "max": maxEmpty});
    }
    // move the current rows
    var oldFirst = Math.floor(lastTop / h2);
    lastTop = tableCnt.scrollTop;
    if(oldFirst!=firstPos) {
        var minEmpty = 0, maxEmpty = nRows;
        if(oldFirst<firstPos && oldFirst>firstPos-nRows) {
            var delta = firstPos - oldFirst;
            for(let i=0;i<nRows-delta;i++) copyRow(i, i+delta)
            minEmpty=nRows-delta;
        } else if(oldFirst>firstPos && oldFirst<firstPos+nRows) {
            var delta = oldFirst - firstPos;
            for(let i=nRows-1;i>=delta;i--) copyRow(i, i-delta)
            maxEmpty=delta;
        }
        for(let i=minEmpty;i<maxEmpty;i++) {
            var dest = document.getElementById("row"+(i+1));
            if(dest) {
                dest.classList.remove("filled");
                dest.classList.add("empty");
                dest.children[0].textContent = (i+1+firstPos)+"";
            }
        }
        if(minEmpty<=maxEmpty) {
            minEmpty+=1+firstPos;
            maxEmpty+=1+firstPos;
            console.debug("ask rows "+minEmpty+"-"+maxEmpty)
            vscode.postMessage({"command": "rows", "min":minEmpty, "max": maxEmpty});
        }

    }
}

function onKeyPress(evt) {
    var selChanged = false;
    switch (evt.code) {
        case "ArrowRight":
            selCol = Math.min(selCol+1, dbfCols.length);
            selChanged = true;
            break;
        case "ArrowLeft":
            selCol = Math.max(selCol-1, 1);
            selChanged = true;
            break;
        case "ArrowUp":
            selRow = Math.max(selRow-1, 1);
            selChanged = true;
            break;
        case "ArrowDown":
            selRow = Math.min(selRow+1, dbfInfo.nRecord);
            selChanged = true;
            break;
        default:
            break;
    }
    if(selChanged) {
        for (let iRow = 0; iRow < totalRows; iRow++) {
            var dest = document.getElementById("row"+(iRow+1));
            if(!dest) continue;
            var idx = parseInt(dest.children[0].textContent);
            for (let iCol = 0; iCol < dbfCols.length; iCol++) {
                if(idx==selRow && (iCol+1)==selCol) {
                    dest.children[iCol+2].classList.add("selected");
                } else
                    dest.children[iCol+2].classList.remove("selected");
            }
        }
    }
}

function goto(line) {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.scrollTop = line*h2 - h1/2;
    onScroll();
}

var filterTimer;
/**
 *
 * @param {MouseEvent} evt
 */
function changeOrder(evt) {
    if(filterTimer) {
        clearTimeout(filterTimer);
        filterTimer=undefined;
    }
    /** @type{HTMLElement} */
    var element = evt.target;
    var index = Array.prototype.indexOf.call(element.parentNode.children, element);
    var sortOrder = "asc";
    if(element.classList.contains("sort-asc"))
        sortOrder = "desc";
    else if(element.classList.contains("sort-desc"))
        sortOrder = undefined;
    Array.prototype.forEach.call(element.parentNode.children, ele => {
        ele.classList.remove("sort-asc");
        ele.classList.remove("sort-desc");
    });

    if(sortOrder) {
        element.classList.add("sort-"+sortOrder);
    } else
        index = -1;
    //updateOrder();
    for(let i=0;i<totalRows;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest) {
            dest.classList.add("empty");
            dest.classList.remove("filled");
        }
    }
    askFilterUpdate()
}

function resize(nRow) {
    console.debug("resize "+nRow)
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    document.getElementById("empty-scroll").style.height = (h2*(nRow+2)).toFixed(0)+"px";
    for(let i=0;i<totalRows;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest) {
            if(i<nRow)
                dest.style.display="table-row";
            else
                dest.style.display="none"
        }
    }

    var tableCnt = document.getElementById("table-cnt");
    var h1 = document.body.clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;;
    var nRows = Math.floor(h1/h2)-1;
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    console.debug("ask rows "+firstPos+"-"+(firstPos+nRows))
    vscode.postMessage({"command": "rows", "min":(firstPos), "max": (firstPos+nRows)});
}

function checkBoxEvt(ev) {
    if(ev.target.classList.contains("codicon-check-3rd-state")) {
        ev.target.classList.remove("codicon-check-3rd-state")
        ev.target.classList.add("codicon-check")
    } else if(ev.target.classList.contains("codicon-check")) {
        ev.target.classList.remove("codicon-check")
        ev.target.classList.add("codicon-uncheck")
    } else {
        ev.target.classList.add("codicon-check-3rd-state")
        ev.target.classList.remove("codicon-uncheck")
    }
    if(filterTimer) {
        clearTimeout(filterTimer);
        filterTimer=undefined;
    }
    filterTimer = setTimeout(askFilterUpdate,100);
}

function addFilter(ev) {
    if(filterTimer) {
        clearTimeout(filterTimer);
        filterTimer=undefined;
    }
    filterTimer = setTimeout(askFilterUpdate,100);
}

function askFilterUpdate() {
    var header = document.getElementsByTagName("thead")[0];
    var sortIdx  = Array.prototype.findIndex.call(
            header.children[0].children, (v) => {
                return v.classList.contains("sort-asc") ||
                       v.classList.contains("sort-desc")
            } );
    var sortDesc = false;
    if(sortIdx>=0) {
        sortDesc = header.children[0].children[sortIdx].classList.contains("sort-desc");
    }

    for(let i=0;i<totalRows;i++) {
        var dest = document.getElementById("row"+(i+1));
        if(dest) {
            dest.classList.add("empty");
            dest.classList.remove("filled");
        }
    }
    var orderCmd = {"command": "order", "colId": sortIdx-1, "desc": sortDesc};
    orderCmd.filters = {};
    for(let i=1;i<header.children[1].children.length;++i) {
        let cell = header.children[1].children[i];
        /** @type {HTMLInputElement|HTMLDivElement} */
        let inp = cell.children[0];
        if(inp.className=="HTMLInputElement") {
            if(inp.value!="") {
                orderCmd.filters[i-1] = inp.value;
            }
        } else {
            if(inp.classList.contains("codicon-uncheck")) {
                orderCmd.filters[i-1] = false;
            }
            if(inp.classList.contains("codicon-check")) {
                orderCmd.filters[i-1] = true;
            }
        }
    }
    console.debug("ask order "+sortIdx+" + filters "+orderCmd.filters.length)
    vscode.postMessage(orderCmd);
}
