/* eslint-env browser */
const vscode = acquireVsCodeApi();

var dbfInfo, dbfCols, totalRows;
var selRow = 1, selCol = 1;

window.addEventListener("message", ev => {
    switch (ev.data.command) {
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
            break;
        case "reload":
            reaskAll()
            break;
        case "list":
            showList(ev.data)
            break;
    }
});

document.addEventListener('DOMContentLoaded', function () {
    vscode.postMessage({ "command": "ready" });
}, false);


function info() {
    dbfInfo.nFilteredRow = dbfInfo.nRecord;
    // set up information on right
    var dest = document.getElementById("info-cnt");
    var txt = "<h1>DBF informations</h1>";
    txt += `<p><b>version:</b> ${dbfInfo.version}</p>`
    var lastMod = new Date(dbfInfo.year + 1900, dbfInfo.month - 1, dbfInfo.day);
    var dateOpt = { year: "numeric", month: "2-digit", day: "2-digit" };
    var dFormat = new Intl.DateTimeFormat(navigator.language, dateOpt);
    txt += `<p><b>last modified date:</b> ${dFormat.format(lastMod)}</p>`
    txt += `<p><b># records:</b> ${dbfInfo.nRecord}</p>`
    txt += "<h2>Columns</h2>";
    for (let i = 0; i < dbfCols.length; i++) {
        const colInfo = dbfCols[i];
        if (colInfo.baseType == "N")
            txt += `<p><b class="nCol">${colInfo.name}</b>(${colInfo.type}:${colInfo.len}.${colInfo.dec})</p>`
        else
            txt += `<p><b class="${colInfo.baseType.toLowerCase()}Col">${colInfo.name}</b>(${colInfo.type}:${colInfo.len})</p>`
    }
    //txt += '<input type="datetime-local"><br>'
    //txt += '<input type="datetime-local"><br>'
    //txt += '<input type="date"><br>'
    //txt += '<input type="time-local"><br>'
    dest.innerHTML = txt;
    // set up columns
    header(dbfCols);
    // setup  rows
    setupRows(dbfCols, dbfInfo);
    // setup scrolling
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.onscroll = onScroll;
    document.body.onkeydown = onKeyPress;
    window.onresize = onScroll;
    onScroll();
}

function header(colInfo) {
    var head = document.getElementsByTagName("thead")[0];
    if (head.children.length > 0) return;
    var dest = document.createElement("tr");
    head.appendChild(dest);
    var filters = document.createElement("tr");
    //filters.style.display = "none";
    head.appendChild(filters);

    var cell = document.createElement("th");
    cell.className = "noborder";
    dest.appendChild(cell);
    cell = document.createElement("th");
    cell.className = "noborder";
    filters.appendChild(cell);

    var row = [dest, filters];
    for (let id = 0; id < colInfo.length; id++) {
        for (let i = 0; i < 2; i++) {
            var cell = document.createElement("th");
            var w = colInfo[id].len;
            cell.style.overflow = "hidden";
            switch (colInfo[id].type) {
                case "D": w = 10; break;
                case "T": w = 8; break;
                case "@": w = 22; break;
            }
            if (colInfo[id].type == "L")
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = "18px";
            else
                cell.style.width = cell.style.maxWidth = cell.style.minWidth = w + "ch";

            if (i == 0) {
                cell.onclick = changeOrder;
                cell.title = colInfo[id].name;
                cell.textContent = colInfo[id].name;
            } else if (colInfo[id].type == "L") {
                cell.style.padding = "0";
                var inp = document.createElement("div")
                inp.classList.add("codicon", "checkbox", "codicon-check-3rd-state");
                inp.style.cursor = "pointer";
                inp.addEventListener("click", checkBoxEvt)
                cell.appendChild(inp);
            } else {
                cell.style.padding = "0";
                var inp = document.createElement("input")
                inp.addEventListener("keyup", addFilter)
                cell.appendChild(inp);
                switch (colInfo[id].type) {
                    case "N":
                        inp.addEventListener("focusin", showNumDrop)
                        //inp.addEventListener("focusout", hideNumDrop)
                        inp.style.textAlign = "right"
                        cell.style.position = "relative";
                        var icon = document.createElement("span")
                        icon.classList.add("input-overlay")
                        icon.classList.add("codicon")
                        icon.classList.add("codicon-equal")
                        cell.insertBefore(icon, inp);
                        break;
                    case "C":
                        inp.addEventListener("focusin", showTextDrop)
                        inp.addEventListener("keyup", showTextDrop)
                        break;
                    case "D":
                        //inp.addEventListener("focusin", showDateDown)
                        //inp.addEventListener("keyup", showDateDown)
                        break;
                    default:
                        break;
                }
            }
            row[i].appendChild(cell);
        }
    }
    document.body.addEventListener("click", hideDrops, { "passive": true })
    // initialize lastFilter
    askFilterUpdate()
}

function setupRows() {
    var body = document.getElementsByTagName("tbody")[0];
    body.innerHTML = "";
    var h1 = screen.height //document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    totalRows = Math.floor(h1 / h2) - 2;
    document.getElementById("empty-scroll").style.height = (h2 * (dbfInfo.nRecord + 2)).toFixed(0) + "px";
    for (let i = 0; i < totalRows; i++) {
        var dest = document.createElement("tr");
        dest.id = "row" + (i + 1);
        dest.className = "empty";
        var cell = document.createElement("td");
        cell.textContent = (i + 1) + "";
        cell.style.textAlign = "right"
        dest.appendChild(cell);
        cell = document.createElement("td");
        cell.colSpan = dbfCols.length;
        cell.className = "loading";
        dest.appendChild(cell);
        for (let id = 0; id < dbfCols.length; id++) {
            /** @type {HTMLElement} */
            var cell = document.createElement("td");
            switch (dbfCols[id].type) {
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
    h1 = document.getElementsByTagName("body")[0].clientHeight

    var n = Math.floor(h1 / h2) - 1;
    //console.debug("ask rows 1-"+n)
    vscode.postMessage({ "command": "rows", "min": 1, "max": n });
}

function row(idx, recNo, data, deleted) {
    //console.debug("<row-" + idx + "-" + recNo)
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var id = idx - firstPos;
    var dest = document.getElementById("row" + (id));
    if (!dest) return;
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if (deleted) {
        dest.classList.add("deleted");
    } else {
        dest.classList.remove("deleted");
    }
    dest.children[0].textContent = recNo + "";
    for (let id = 0; id < data.length; id++) {
        if (idx == selRow && (id + 1) == selCol) {
            dest.children[id + 2].classList.add("selected");
        } else
            dest.children[id + 2].classList.remove("selected");
        if (dbfCols[id].type == "L") {
            var html = '<div class="codicon checkbox'
            if (data[id]) html += " codicon-check"
            html += '"></div>'
            dest.children[id + 2].innerHTML = html
        } else
            dest.children[id + 2].textContent = data[id];
    }
}

function copyRow(destId, srcId) {
    var dest = document.getElementById("row" + (destId + 1));
    var src = document.getElementById("row" + (srcId + 1));
    if ((!dest) || (!src)) return;
    if (src.classList.contains("empty")) {
        dest.classList.add("empty");
        dest.classList.remove("filled");
        return;
    }
    dest.classList.remove("empty");
    dest.classList.add("filled");
    if (src.classList.contains("deleted")) {
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
    var nRows = Math.floor(h1 / h2) - 2;

    var maxTop = ((dbfInfo.nFilteredRow + 3) * h2) - h1;
    tableCnt.children[0].style.top = Math.max(0, Math.min(maxTop, tableCnt.scrollTop)) + "px";

    // hide and show rows based on current height
    //var firstPos = Math.min(Math.floor(tableCnt.scrollTop / h2), dbfInfo.nFilteredRow-totalRows-1)
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    var minEmpty = dbfInfo.nRecord, maxEmpty = 0;
    for (let i = 0; i < totalRows; i++) {
        var dest = document.getElementById("row" + (i + 1));
        if (dest) {
            var n = (i + 1 + firstPos);
            if (n > dbfInfo.nFilteredRow || i >= nRows) {
                dest.style.display = "none";
                dest.classList.add("empty");
                dest.classList.remove("filled");
            } else {
                dest.style.display = "table-row";
                if (dest.classList.contains("empty")) {
                    if (n < minEmpty) minEmpty = n;
                    if (n > maxEmpty) maxEmpty = n;
                }
            }
        }
    }
    if (minEmpty <= maxEmpty) {
        //console.debug("ask rows "+minEmpty+"-"+maxEmpty)
        vscode.postMessage({ "command": "rows", "min": minEmpty, "max": maxEmpty });
    }
    // move the current rows
    var oldFirst = Math.floor(lastTop / h2);
    lastTop = tableCnt.scrollTop;
    if (oldFirst != firstPos) {
        var minEmpty = 0, maxEmpty = nRows;
        if (oldFirst < firstPos && oldFirst > firstPos - nRows) {
            var delta = firstPos - oldFirst;
            for (let i = 0; i < nRows - delta; i++) copyRow(i, i + delta)
            minEmpty = nRows - delta;
        } else if (oldFirst > firstPos && oldFirst < firstPos + nRows) {
            var delta = oldFirst - firstPos;
            for (let i = nRows - 1; i >= delta; i--) copyRow(i, i - delta)
            maxEmpty = delta;
        }
        for (let i = minEmpty; i < maxEmpty; i++) {
            var dest = document.getElementById("row" + (i + 1));
            if (dest) {
                dest.classList.remove("filled");
                dest.classList.add("empty");
                dest.children[0].textContent = (i + 1 + firstPos) + "";
            }
        }
        if (minEmpty <= maxEmpty) {
            minEmpty += 1 + firstPos;
            maxEmpty += 1 + firstPos;
            //console.debug("ask rows "+minEmpty+"-"+maxEmpty)
            vscode.postMessage({ "command": "rows", "min": minEmpty, "max": maxEmpty });
        }

    }
}

function onKeyPress(evt) {
    var selChanged = false;
    switch (evt.code) {
        case "ArrowRight":
            selCol = Math.min(selCol + 1, dbfCols.length);
            selChanged = true;
            break;
        case "ArrowLeft":
            selCol = Math.max(selCol - 1, 1);
            selChanged = true;
            break;
        case "ArrowUp":
            selRow = Math.max(selRow - 1, 1);
            selChanged = true;
            break;
        case "ArrowDown":
            selRow = Math.min(selRow + 1, dbfInfo.nRecord);
            selChanged = true;
            break;
        default:
            break;
    }
    if (selChanged) {
        for (let iRow = 0; iRow < totalRows; iRow++) {
            var dest = document.getElementById("row" + (iRow + 1));
            if (!dest) continue;
            var idx = parseInt(dest.children[0].textContent);
            for (let iCol = 0; iCol < dbfCols.length; iCol++) {
                if (idx == selRow && (iCol + 1) == selCol) {
                    dest.children[iCol + 2].classList.add("selected");
                } else
                    dest.children[iCol + 2].classList.remove("selected");
            }
        }
    }
}

function goto(line) {
    var h1 = document.getElementsByTagName("body")[0].clientHeight
    var h2 = document.getElementById("row1").clientHeight
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.scrollTop = line * h2 - h1 / 2;
    onScroll();
}

var filterTimer;
/**
 *
 * @param {MouseEvent} evt
 */
function changeOrder(evt) {
    if (filterTimer) {
        clearTimeout(filterTimer);
        filterTimer = undefined;
    }
    /** @type{HTMLElement} */
    var element = evt.target;
    var index = Array.prototype.indexOf.call(element.parentNode.children, element);
    var sortOrder = "asc";
    if (element.classList.contains("sort-asc"))
        sortOrder = "desc";
    else if (element.classList.contains("sort-desc"))
        sortOrder = undefined;
    Array.prototype.forEach.call(element.parentNode.children, ele => {
        ele.classList.remove("sort-asc");
        ele.classList.remove("sort-desc");
    });

    if (sortOrder) {
        element.classList.add("sort-" + sortOrder);
    } else
        index = -1;
    //updateOrder();
    for (let i = 0; i < totalRows; i++) {
        var dest = document.getElementById("row" + (i + 1));
        if (dest) {
            dest.classList.add("empty");
            dest.classList.remove("filled");
        }
    }
    askFilterUpdate()
}

function resize(nRow) {
    //console.debug("resize "+nRow)
    dbfInfo.nFilteredRow = nRow;
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    document.getElementById("empty-scroll").style.height = (h2 * (nRow + 1)).toFixed(0) + "px";
    for (let i = 0; i < totalRows; i++) {
        var dest = document.getElementById("row" + (i + 1));
        if (dest) {
            if (i < nRow)
                dest.style.display = "table-row";
            else
                dest.style.display = "none"
        }
    }
    reaskAll()
}
function reaskAll() {
    var tableCnt = document.getElementById("table-cnt");
    var h1 = document.body.clientHeight
    var h2 = document.getElementsByTagName("thead")[0].children[0].clientHeight;
    var nRows = Math.floor(h1 / h2) - 1;
    var firstPos = Math.floor(tableCnt.scrollTop / h2);
    //console.debug("ask rows "+firstPos+"-"+(firstPos+nRows))
    vscode.postMessage({ "command": "rows", "min": (firstPos), "max": (firstPos + nRows) });
}

function checkBoxEvt(ev) {
    if (ev.target.classList.contains("codicon-check-3rd-state")) {
        ev.target.classList.remove("codicon-check-3rd-state")
        ev.target.classList.add("codicon-check")
    } else if (ev.target.classList.contains("codicon-check")) {
        ev.target.classList.remove("codicon-check")
        ev.target.classList.add("codicon-uncheck")
    } else {
        ev.target.classList.add("codicon-check-3rd-state")
        ev.target.classList.remove("codicon-uncheck")
    }
    if (filterTimer) {
        clearTimeout(filterTimer);
        filterTimer = undefined;
    }
    filterTimer = setTimeout(askFilterUpdate, 100);
}

function addFilter(ev) {
    if (filterTimer) {
        clearTimeout(filterTimer);
        filterTimer = undefined;
    }
    filterTimer = setTimeout(askFilterUpdate, 100);
}

var lastFilter;
function askFilterUpdate() {
    var header = document.getElementsByTagName("thead")[0];
    var sortIdx = Array.prototype.findIndex.call(
        header.children[0].children, (v) => {
            return v.classList.contains("sort-asc") ||
                v.classList.contains("sort-desc")
        });
    var sortDesc = false;
    if (sortIdx > 0) {
        sortDesc = header.children[0].children[sortIdx].classList.contains("sort-desc");
    } else
        sortIdx = 0;

    var orderCmd = { "command": "order", "colId": sortIdx - 1, "desc": sortDesc };
    orderCmd.filters = {};
    var ckFilter = [];
    for (let i = 1; i < header.children[1].children.length; ++i) {
        let cell = header.children[1].children[i];
        /** @type {HTMLInputElement|HTMLDivElement} */
        let inp = cell.children[0];
        if (cell.children.length > 1) {
            var currIcon = Array.prototype.find.call(inp.classList, (v) => v.startsWith("codicon-"));
            orderCmd.filters["operator-" + (i - 1)] = currIcon.substring(8)
            inp = cell.children[1];
        }
        if (inp.constructor.name == "HTMLInputElement") {
            if (inp.value != "") {
                orderCmd.filters[i - 1] = inp.value;
                ckFilter[i - 1] = inp.value;
            }
        } else {
            if (inp.classList.contains("codicon-uncheck")) {
                orderCmd.filters[i - 1] = false;
                ckFilter[i - 1] = false;
            }
            if (inp.classList.contains("codicon-check")) {
                orderCmd.filters[i - 1] = true;
                ckFilter[i - 1] = true;
            }
        }
    }


    var ask = false;
    if (lastFilter != undefined) {
        console.debug("ask order " + sortIdx + " + filters " + ckFilter.length)
        ask = lastFilter.colId != orderCmd.colId;
        for (let i in lastFilter.filters) {
            if (!(i in orderCmd.filters)) {
                ask = true;
                break;
            } else {
                if (i.toString().startsWith("operator-") && !(i.substring(9) in orderCmd.filters))
                    continue;
                ask = ask || lastFilter.filters[i] != orderCmd.filters[i];
            }
        }
        for (let i in orderCmd.filters) {
            if (!(i in lastFilter.filters)) {
                ask = true;
                break;
            }
        }
    }
    lastFilter = orderCmd;
    if (ask) {
        for (let i = 0; i < totalRows; i++) {
            var dest = document.getElementById("row" + (i + 1));
            if (dest) {
                dest.classList.add("empty");
                dest.classList.remove("filled");
            }
        }
        vscode.postMessage(orderCmd);
    }
}

/** @type {HTMLInputElement} */
var currentFilterDropDown = undefined;
var hideNextNumeric = false
var hideNextGeneric = false
var hideNextDateTime = false

function putDropDown(dropDown) {
    var cnt = document.getElementById("table-cnt")
    var parentRect = cnt.getBoundingClientRect()
    var destRect = currentFilterDropDown.parentElement.getBoundingClientRect()
    dropDown.style.display = "block";
    dropDown.style.top = (destRect.bottom - parentRect.top + cnt.scrollTop) + "px"
    dropDown.style.left = (destRect.left - parentRect.left + cnt.scrollLeft) + "px"

}

function showNumDrop(ev) {
    hideDrops();
    if(("keyCode" in ev)&&(ev.keyCode==27)) return;
    hideNextNumeric = true;
    currentFilterDropDown = ev.target;
    var dropDown = document.getElementById("dropdown_numeric")
    putDropDown(dropDown);
    /** @type {HTMLElement} */
    var iconElement = ev.target.parentNode.children[0];
    var currIcon = Array.prototype.find.call(iconElement.classList, (v) => v.startsWith("codicon-"));
    Array.prototype.forEach.call(dropDown.children, (v) => v.classList.remove("selected"))
    Array.prototype.forEach.call(dropDown.children, (v) => v.onclick = numericSelected)
    var ele = Array.prototype.find.call(dropDown.children, (v) => v.children[0].classList.contains(currIcon));
    if (ele) ele.classList.add("selected")
}

function numericSelected(ev) {
    var iconElement = ev.target.children[0];
    var destIcon = currentFilterDropDown.parentNode.children[0];
    var currIcon = Array.prototype.find.call(destIcon.classList, (v) => v.startsWith("codicon-"));
    destIcon.classList.remove(currIcon)
    var selectedIcon = Array.prototype.find.call(iconElement.classList, (v) => v.startsWith("codicon-"));
    destIcon.classList.add(selectedIcon)
    askFilterUpdate();
    currentFilterDropDown.focus();
}

function showTextDrop(ev) {
    hideDrops();
    if(("keyCode" in ev)&&(ev.keyCode==27)) return;
    hideNextGeneric = true;
    currentFilterDropDown = ev.target;
    var dropDown = document.getElementById("dropdown_generic")
    putDropDown(dropDown);
    //dropDown.innerHTML='<div class="loading" >'
    dropDown.innerHTML = '';
    var element = ev.target.parentNode;
    var index = Array.prototype.indexOf.call(element.parentNode.children, element);
    console.debug("ask list " + (index - 1))
    var askList = { "command": "getList", "colId": index - 1, "filter": currentFilterDropDown.value }
    vscode.postMessage(askList);
}

function showList(data) {
    var dropDown = document.getElementById("dropdown_generic")
    if (data.items == undefined || currentFilterDropDown == undefined) {
        console.debug("get list empty")
        dropDown.style.display = "none";
        return;
    }
    console.debug("get list " + (data.items.length))
    dropDown.style.display = "block";
    var base = currentFilterDropDown.value.toLowerCase()
    for (let i = 0; i < data.items.length; i++) {
        //<p><span class="icon-space codicon codicon-symbol-key"></span>p<span class="match">rov</span>a 1</p>
        var value = data.items[i];
        var idx;
        if (base.length > 0 && (idx = value.toLowerCase().indexOf(base)) >= 0) {
            var endM = idx + base.length
            value = value.substring(0, idx) + "<span class=\"match\">" + value.substring(idx, endM) + "</span>" + value.substring(endM)
        }
        var pEle = document.createElement("p")
        pEle.innerHTML = "<span class=\"icon-space codicon codicon-symbol-key\"></span>" + value;
        pEle.onclick = textSelected;
        dropDown.appendChild(pEle);
    }
}

function textSelected(ev) {
    currentFilterDropDown.value = ev.target.textContent;
    console.debug("selected " + ev.target.textContent)
    var dropDown = document.getElementById("dropdown_generic")
    dropDown.innerHTML = "";
    dropDown.appendChild(ev.target);
    askFilterUpdate();
    //showDropDown({"target":currentFilterDropDown})
}

function showDateDown(ev) {
    hideDrops();
    hideNextDateTime = true;
    currentFilterDropDown = ev.target;
    var dropDown = document.getElementById("dropdown_datetime")
    putDropDown(dropDown);

    //dropDown.innerHTML='<div class="loading" >'
}



function hideDrops() {
    if (!hideNextNumeric && !hideNextGeneric && !hideNextDateTime)
        currentFilterDropDown = undefined;
    if (hideNextNumeric) {
        hideNextNumeric = false;
    } else {
        var dropDown = document.getElementById("dropdown_numeric")
        dropDown.style.display = "none";
    }
    if (hideNextGeneric) {
        hideNextGeneric = false;
    } else {
        var dropDown = document.getElementById("dropdown_generic")
        if (dropDown.style.display != "none")
            console.debug("hide dropdown")
        dropDown.style.display = "none";
    }
    if (hideNextDateTime) {
        hideNextDateTime = false;
    } else {
        var dropDown = document.getElementById("dropdown_datetime")
        if (dropDown.style.display != "none")
            console.debug("hide dropdown")
        dropDown.style.display = "none";
    }
}