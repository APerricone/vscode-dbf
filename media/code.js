const vscode = acquireVsCodeApi();

var dbfInfo, dbfCols;
var selRow = 1, selCol = 1;

/*
 * Virtual scrolling state.
 * Rows received from the extension are kept in rowCache keyed by their
 * position in the current order (ordNo). The visible table is a fixed pool
 * of <tr> "slots" that is refilled from the cache on every scroll, so a row
 * that arrives late is never lost: it lands in the cache and is painted the
 * moment its slot becomes visible.
 */
var rowCache = new Map();   // ordNo -> {recNo, data, deleted}
var pendingReq = new Map(); // ordNo -> timestamp of the last request
var firstPos = 0;           // 0 based index of the first visible record
var rowH = 0;               // measured height of one body row
var headerH = 0;            // measured height of the two header rows
var totalRows = 0;          // number of slot rows in the pool
var waitingOrder = false;   // true while a sort/filter change is in flight

const CACHE_LIMIT = 20000;  // max rows kept in the cache
const REASK_MS = 1000;      // do not re-request the same row more often than this

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
    dest.innerHTML = txt;
    // set up columns
    header(dbfCols);
    // setup rows
    setupRows();
    // setup scrolling
    var tableCnt = document.getElementById("table-cnt");
    tableCnt.onscroll = scheduleRender;
    document.body.onkeydown = onKeyPress;
    window.onresize = setupRows;
}

/**
 * Initial column width (in ch) for a column
 */
function colWidth(colInfo) {
    var w = colInfo.len + 1;
    switch (colInfo.type) {
        case "D": w = 11; break;
        case "T": w = 9; break;
        case "@": case "=": w = 23; break;
        case "M": w = 30; break;
    }
    if (colInfo.baseType == "N") w = colInfo.len + 2;
    return Math.min(Math.max(w, 5), 60);
}

function header(colInfo) {
    var head = document.querySelector("#data-table thead");
    if (head.children.length > 0) return;
    // one <col> per column: resizing changes their width (table-layout is fixed)
    var colgroup = document.querySelector("#data-table colgroup");
    var recnoCol = document.createElement("col");
    recnoCol.style.width = Math.max(5, dbfInfo.nRecord.toString().length + 2) + "ch";
    colgroup.appendChild(recnoCol);
    for (let id = 0; id < colInfo.length; id++) {
        var col = document.createElement("col");
        if (colInfo[id].baseType == "L")
            col.style.width = "26px";
        else
            col.style.width = colWidth(colInfo[id]) + "ch";
        colgroup.appendChild(col);
    }

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

    var row = [dest, filters];
    for (let id = 0; id < colInfo.length; id++) {
        for (let i = 0; i < 2; i++) {
            var cell = document.createElement("th");
            if (i == 0) {
                cell.onclick = changeOrder;
                cell.title = colInfo[id].name;
                cell.textContent = colInfo[id].name;
                var handle = document.createElement("div");
                handle.className = "col-resize-handle";
                handle.addEventListener("mousedown", startColResize);
                cell.appendChild(handle);
            } else if (colInfo[id].baseType == "L") {
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
                switch (colInfo[id].baseType) {
                    case "N":
                        inp.addEventListener("focusin", showNumDrop)
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
                    default:
                        break;
                }
            }
            row[i].appendChild(cell);
        }
    }
    document.body.addEventListener("click", hideDrops, { "passive": true })
    // a fresh press anywhere but a handle means the next click is not "after a resize"
    document.body.addEventListener("mousedown", (ev) => {
        if (!(ev.target.classList && ev.target.classList.contains("col-resize-handle")))
            justResized = false;
    }, { "passive": true })
    // initialize lastFilter
    askFilterUpdate()
}

function makeSlotRow() {
    var dest = document.createElement("tr");
    dest.className = "empty";
    var cell = document.createElement("td");
    cell.style.textAlign = "right"
    dest.appendChild(cell);
    cell = document.createElement("td");
    cell.colSpan = dbfCols.length;
    cell.className = "loading";
    dest.appendChild(cell);
    for (let id = 0; id < dbfCols.length; id++) {
        /** @type {HTMLElement} */
        var cell = document.createElement("td");
        switch (dbfCols[id].baseType) {
            case "C":
                cell.className = "cCol";
                break;
            case "M":
                cell.className = "mCol";
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
    return dest;
}

function setupRows() {
    if (!dbfCols) return;
    var body = document.querySelector("#data-table tbody");
    body.innerHTML = "";
    var thead = document.querySelector("#data-table thead");
    headerH = thead.getBoundingClientRect().height;
    // the second header row sticks right below the first one
    var row1H = thead.children[0].getBoundingClientRect().height;
    document.getElementById("table-cnt").style.setProperty("--row1-h", row1H + "px");
    // measure the row height on a representative row (checkboxes may be
    // taller than a text line), then give every slot that fixed height
    var probe = makeSlotRow();
    probe.classList.remove("empty");
    probe.classList.add("filled");
    probe.children[0].textContent = "0";
    for (let id = 0; id < dbfCols.length; id++) {
        if (dbfCols[id].baseType == "L")
            probe.children[id + 2].innerHTML = '<div class="codicon checkbox"></div>';
        else
            probe.children[id + 2].textContent = "X";
    }
    body.appendChild(probe);
    rowH = probe.getBoundingClientRect().height;
    body.innerHTML = "";
    var tableCnt = document.getElementById("table-cnt");
    totalRows = Math.max(1, Math.ceil((tableCnt.clientHeight - headerH) / rowH) + 2);
    for (let i = 0; i < totalRows; i++) {
        var slot = makeSlotRow();
        slot.style.height = rowH + "px";
        body.appendChild(slot);
    }
    updateSpacer();
    render();
}

function updateSpacer() {
    document.getElementById("empty-scroll").style.height = (headerH + dbfInfo.nFilteredRow * rowH) + "px";
}

var renderPending = false;
function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => { renderPending = false; render(); });
}

function render() {
    if (!dbfInfo || !rowH) return;
    var tableCnt = document.getElementById("table-cnt");
    var maxFirst = Math.max(0, dbfInfo.nFilteredRow - 1);
    firstPos = Math.min(Math.floor(tableCnt.scrollTop / rowH), maxFirst);
    // keep the table aligned to the row grid; the sticky header stays on top
    document.getElementById("data-table").style.top = (firstPos * rowH) + "px";
    var body = document.querySelector("#data-table tbody");
    var missMin = Infinity, missMax = -Infinity;
    for (let i = 0; i < body.children.length; i++) {
        var ordNo = firstPos + i + 1;
        if (fillSlot(body.children[i], ordNo)) {
            if (ordNo < missMin) missMin = ordNo;
            if (ordNo > missMax) missMax = ordNo;
        }
    }
    if (missMin <= missMax && !waitingOrder)
        requestRows(missMin, missMax);
    evictCache();
}

/**
 * Fill one slot row with the record at ordNo.
 * @returns {Boolean} true when the record is not in the cache yet
 */
function fillSlot(tr, ordNo) {
    if (ordNo > dbfInfo.nFilteredRow) {
        tr.style.display = "none";
        return false;
    }
    tr.style.display = "";
    tr.classList.toggle("odd-row", (ordNo % 2) == 1);
    var rec = rowCache.get(ordNo);
    if (!rec) {
        tr.classList.add("empty");
        tr.classList.remove("filled");
        tr.classList.remove("deleted");
        tr.children[0].textContent = ordNo + "";
        return true;
    }
    tr.classList.remove("empty");
    tr.classList.add("filled");
    tr.classList.toggle("deleted", Boolean(rec.deleted));
    tr.children[0].textContent = rec.recNo + "";
    for (let id = 0; id < rec.data.length; id++) {
        var cell = tr.children[id + 2];
        if (ordNo == selRow && (id + 1) == selCol)
            cell.classList.add("selected");
        else
            cell.classList.remove("selected");
        if (dbfCols[id].baseType == "L") {
            var html = '<div class="codicon checkbox'
            if (rec.data[id]) html += " codicon-check"
            html += '"></div>'
            cell.innerHTML = html
        } else {
            var text = rec.data[id];
            if (typeof text == "string" && /[\r\n\t]/.test(text)) {
                // keep the row single line, the full text goes in the tooltip
                cell.title = text;
                text = text.replace(/\r\n|[\r\n\t]/g, " ");
            } else if (dbfCols[id].baseType == "M" && text) {
                cell.title = text;
            } else {
                cell.removeAttribute("title");
            }
            cell.textContent = text;
        }
    }
    return false;
}

function requestRows(min, max) {
    var now = Date.now();
    var askMin = Infinity, askMax = -Infinity;
    for (let n = min; n <= max; n++) {
        if (rowCache.has(n)) continue;
        var t = pendingReq.get(n);
        if (t != undefined && now - t < REASK_MS) continue;
        pendingReq.set(n, now);
        if (n < askMin) askMin = n;
        if (n > askMax) askMax = n;
    }
    if (askMin <= askMax) {
        //console.debug("ask rows " + askMin + "-" + askMax)
        vscode.postMessage({ "command": "rows", "min": askMin, "max": askMax });
    }
}

function evictCache() {
    if (rowCache.size <= CACHE_LIMIT) return;
    for (const key of rowCache.keys()) {
        if (key < firstPos - 2000 || key > firstPos + 2000)
            rowCache.delete(key);
    }
}

function row(ordNo, recNo, data, deleted) {
    //console.debug("<row-" + ordNo + "-" + recNo)
    if (!(ordNo >= 1)) return; // filtered out or unknown position
    rowCache.set(ordNo, { recNo: recNo, data: data, deleted: deleted });
    pendingReq.delete(ordNo);
    // repaint its slot when currently visible
    var i = ordNo - firstPos - 1;
    if (i >= 0 && i < totalRows) {
        var body = document.querySelector("#data-table tbody");
        if (body.children[i]) fillSlot(body.children[i], ordNo);
    }
}

function onKeyPress(evt) {
    if (evt.target && (evt.target.tagName == "INPUT" || evt.target.tagName == "TEXTAREA"))
        return;
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
            selRow = Math.min(selRow + 1, dbfInfo.nFilteredRow);
            selChanged = true;
            break;
        default:
            break;
    }
    if (selChanged) {
        evt.preventDefault();
        // keep the selection visible
        var tableCnt = document.getElementById("table-cnt");
        var viewRows = Math.max(1, Math.floor((tableCnt.clientHeight - headerH) / rowH));
        if (selRow - 1 < firstPos)
            tableCnt.scrollTop = (selRow - 1) * rowH;
        else if (selRow > firstPos + viewRows)
            tableCnt.scrollTop = (selRow - viewRows) * rowH;
        render();
    }
}

function goto(line) {
    var tableCnt = document.getElementById("table-cnt");
    var viewH = tableCnt.clientHeight - headerH;
    tableCnt.scrollTop = Math.max(0, (line - 1) * rowH - viewH / 2 + rowH / 2);
    render();
}

var filterTimer;
/**
 *
 * @param {MouseEvent} evt
 */
function changeOrder(evt) {
    if (evt.target.classList.contains("col-resize-handle")) return;
    if (justResized) {
        justResized = false;
        return;
    }
    if (filterTimer) {
        clearTimeout(filterTimer);
        filterTimer = undefined;
    }
    /** @type{HTMLElement} */
    var element = evt.target;
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
    }
    askFilterUpdate()
}

function resize(nRow) {
    //console.debug("resize "+nRow)
    dbfInfo.nFilteredRow = nRow;
    waitingOrder = false;
    rowCache.clear();
    pendingReq.clear();
    updateSpacer();
    render();
}

function reaskAll() {
    rowCache.clear();
    pendingReq.clear();
    render();
}

// ---------------------------------------------------------------- column resize

var colResize = null; // {col, startX, startW}
var justResized = false;

function startColResize(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var th = ev.target.parentElement;
    var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
    var colgroup = document.querySelector("#data-table colgroup");
    colResize = {
        col: colgroup.children[idx],
        startX: ev.clientX,
        startW: th.getBoundingClientRect().width
    };
    document.addEventListener("mousemove", moveColResize);
    document.addEventListener("mouseup", endColResize);
}

function moveColResize(ev) {
    if (!colResize) return;
    ev.preventDefault();
    var dx = ev.clientX - colResize.startX;
    if (dx != 0) justResized = true; // the click after the drag must not sort
    colResize.col.style.width = Math.max(20, colResize.startW + dx) + "px";
}

function endColResize() {
    document.removeEventListener("mousemove", moveColResize);
    document.removeEventListener("mouseup", endColResize);
    colResize = null;
}

// ---------------------------------------------------------------- filters

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

function addFilter() {
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
        if (cell.children.length > 1 && inp.constructor.name != "HTMLInputElement") {
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
        ask = lastFilter.colId != orderCmd.colId || lastFilter.desc != orderCmd.desc;
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
        waitingOrder = true;
        rowCache.clear();
        pendingReq.clear();
        render();
        vscode.postMessage(orderCmd);
    }
}

// ---------------------------------------------------------------- dropdowns

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
    if (("keyCode" in ev) && (ev.keyCode == 27)) return;
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
    if (("keyCode" in ev) && (ev.keyCode == 27)) return;
    hideNextGeneric = true;
    currentFilterDropDown = ev.target;
    var dropDown = document.getElementById("dropdown_generic")
    putDropDown(dropDown);
    dropDown.innerHTML = '';
    var element = ev.target.parentNode;
    var index = Array.prototype.indexOf.call(element.parentNode.children, element);
    var askList = { "command": "getList", "colId": index - 1, "filter": currentFilterDropDown.value }
    vscode.postMessage(askList);
}

function showList(data) {
    var dropDown = document.getElementById("dropdown_generic")
    if (data.items == undefined || currentFilterDropDown == undefined) {
        dropDown.style.display = "none";
        return;
    }
    dropDown.style.display = "block";
    var base = currentFilterDropDown.value.toLowerCase()
    for (let i = 0; i < data.items.length; i++) {
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
    var dropDown = document.getElementById("dropdown_generic")
    dropDown.innerHTML = "";
    dropDown.appendChild(ev.target);
    askFilterUpdate();
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
        dropDown.style.display = "none";
    }
    if (hideNextDateTime) {
        hideNextDateTime = false;
    } else {
        var dropDown = document.getElementById("dropdown_datetime")
        dropDown.style.display = "none";
    }
}
