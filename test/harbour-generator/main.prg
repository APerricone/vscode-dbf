request DBFCDX, HB_CODEPAGE_UTF8EX

proc main()
    HB_CDPSELECT("UTF8EX")

    string()
    varString()
    logicalAndDateTime()
return

proc string()
    local txt
    field simple,long, unicode
    if File("TestString.dbf")
        FErase("TestString.dbf")
    endif
    dbCreate("TestString", {;
        {"SIMPLE","C",30,0}, ;
        {"LONG","C",300,0}, ;
        {"UNICODE","C:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
return

proc varString()
    Local txt
    field simple,long, unicode
    if File("TestVarString.dbf")
        FErase("TestVarString.dbf")
    endif
    dbCreate("TestVarString", {;
        {"SIMPLE","Q",30,0}, ;
        {"LONG","Q",300,0}, ;
        {"UNICODE","Q:U",30,0} ; //Unicode
    },"DBFCDX",.T.)
    dbAppend()
    field->simple := "first row"
    field->long := "a very long text"
    txt := "ナルト うずまき"
    field->unicode := txt
    dbAppend()
    field->simple := "second row"
    field->long := "Nel mezzo del cammin di nostra vita \"+;
            " mi ritrovai per una selva oscura, \"+;
            " che la diritta via era smarrita.  \"+;
            " Ahi quanto a dir qual era e' cosa dura \"+;
            " esta selva selvaggia e aspra e forte \"+;
            " che nel pensier rinova la paura!"
    txt := "神曲"
    field->unicode := txt
    dbAppend()
    field->simple := "third  row"
    field->long := "It is not important"
    txt := "تم حذف الخط"
    field->unicode := txt
return

proc logicalAndDateTime()
    local dt
    field logical,date3,date4,date8, time4, time8
    if File("TestLogicalAndDateTime.dbf")
        FErase("TestLogicalAndDateTime.dbf")
    endif
    dbCreate("TestLogicalAndDateTime", {;
        {"logical","L",1,0}, ;
        {"date3","D",3,0}, ;
        {"date4","D",4,0}, ;
        {"date8","D",8,0}, ;
        {"time4","T",4,0}, ;
        {"time8","T",8,0}  ;
    },"DBFCDX",.T.)
    dbAppend()
    field->logical := .T.
    dt := {^ 2020-01-01 12:34:56}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
    dbAppend()
    field->logical := .F.
    dt := {^ 1900-01-01 23:59:59}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
    dbAppend()
    field->logical := .T.
    dt := {^ 2345-12-31 00:00:00}
    field->date3 := dt
    field->date4 := dt
    field->date8 := dt
    field->time4 := dt
    field->time8 := dt
return

