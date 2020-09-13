window.addEventListener("message", ev => {
    switch(ev.data.command) {
        case "header":
            header(ev.data.data);
            break;
        case "row":
            row(ev.data.recno, ev.data.data)
            break;
    }
});
document.addEventListener("readystatechange", () => {
    window.postMessage({"command": "readystatechange", "readyState": document.readyState});
});
function setRowElement(dest,data,type) {
    for (let i = 0; i < data.length; i++) {
        var cell = document.createElement(type);
        cell.textContent = data[i];
        dest.appendChild(cell);
    }
}
function header(data) {
    var dest = document.getElementsByTagName("thead");
    dest = dest[0].children[0];

    var cell = document.createElement("th");
    cell.className = "noborder";
    dest.appendChild(cell);

    setRowElement(dest,data,"th");
    window.postMessage({"command": "headerDone"});
}
function row(idx,data) {
    var body = document.getElementsByTagName("tbody")[0];
    var dest = document.createElement("tr");
    var cell = document.createElement("td");
    cell.textContent = idx;
    dest.appendChild(cell);

    setRowElement(dest,data,"td");
    body.appendChild(dest);
}
